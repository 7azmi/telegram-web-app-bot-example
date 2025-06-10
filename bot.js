const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); // To parse JSON body if needed later, though not for this fetch demo

// --- Configuration ---
const BOT_TOKEN = '8052571653:AAHxhYoEc8Eqku_D3CFzbt09WAiDgRLTXtE'; // <--- REPLACE WITH YOUR BOT TOKEN
// The WEB_APP_URL should be the public URL where your Express server is running and serving the webapp files
// If testing locally with ngrok forwarding port 3000:
// const WEB_APP_URL = 'https://abcdef123456.ngrok.io'; // Replace with your ngrok URL
// If deploying:
const WEB_APP_URL = 'https://7azmi.github.io/telegram-web-app-bot-example/'; // e.g., 'https://your-domain.com'

// --- In-memory storage ---
const user_debts = {}; // { user_id: [ {amount: float, person: {id: string|number, name: string, type: 'known'|'text'}, description: string} ] }
// Simulate some known contacts for users
const simulated_known_contacts = {
    // Replace these user IDs and contact details with your test data
    123456789: [ // Example user ID (replace with your Telegram user ID for testing)
        { id: 'tg_user_987654', name: 'Alice (Telegram User)', telegram_user_id: 987654, type: 'known' },
        { id: 'phone_+15551234567', name: 'Bob (Phone Contact)', phone_number: '+15551234567', type: 'known' },
        { id: 'manual_entry_prev_1', name: 'Grocery Store (Manual)', type: 'known' }
    ],
    // Add more user IDs and their contacts if needed
};

function get_user_debts(user_id) {
    if (!(user_id in user_debts)) {
        user_debts[user_id] = [];
    }
    return user_debts[user_id];
}

function get_known_contacts(user_id) {
    // In a real app, this fetches from a database based on user_id
    return simulated_known_contacts[user_id] || [];
}


// --- Bot Setup ---
const bot = new Telegraf(BOT_TOKEN);

// Command to open the Web App
bot.command('start', (ctx) => {
    console.log(`Received /start from user ${ctx.from.id}`);
    // Pass the user ID to the Web App URL so it knows whose contacts to fetch
    const webAppFullURL = `${WEB_APP_URL}?user_id=${ctx.from.id}`;
    ctx.reply('Hello! Click the button below to manage your debts.', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Open Debt App', web_app: { url: webAppFullURL } }]
            ]
        }
    });
});

// Command to view debts (reused from Python example)
bot.command('viewdebts', async (ctx) => {
    const user_id = ctx.from.id;
    const debts = get_user_debts(user_id);

    if (!debts || debts.length === 0) {
        await ctx.reply("You haven't recorded any debts yet.");
        return;
    }

    let message_text = "Your Debts:\n\n";
    for (const debt of debts) {
        const amount = debt.amount;
        const description = debt.description || 'No description';
        const person = debt.person; // This is the object {id, name, type, ...} or the text string

        let person_info = "Unknown Person";
        let person_link = null; // To potentially add a clickable link

        if (person.type === 'known') {
            person_info = person.name;
            if (person.telegram_user_id) {
                // Create a Telegram user link if we have the ID
                person_link = `tg://user?id=${person.telegram_user_id}`;
                person_info = `[${person_info}](${person_link})`; // Markdown link format
            }
        } else if (person.type === 'text') {
            person_info = `Manual: ${person.name}`; // 'name' holds the text for type 'text'
        }


        const action = amount >= 0 ? "Owed to you" : "You owe";
        const display_amount = Math.abs(amount).toFixed(2);

        message_text += `${action}: ${display_amount} by ${person_info}\n`;
        message_text += `Description: ${description}\n\n`;
    }

    await ctx.reply(message_text, { parse_mode: 'Markdown', disable_web_page_preview: true }); // Use Markdown for the link
});


// Listener for Web App data
bot.on('web_app_data', async (ctx) => {
    const data = ctx.message.web_app_data.data;
    const user_id = ctx.from.id;
    console.log(`Received Web App data from user ${user_id}: ${data}`);

    try {
        const debtData = JSON.parse(data);

        // Basic validation
        if (typeof debtData.amount !== 'number' || typeof debtData.description !== 'string' || !debtData.person) {
            await ctx.reply('Received invalid data from the app.');
            return;
        }

        // Find the full person object if it was a known contact
        let person_details = debtData.person; // This will be the {id, name, type} object or the text string
        if (person_details.type === 'known') {
            // Optional: Find the full contact details from your storage if needed
            const known_contacts = get_known_contacts(user_id);
            const found_contact = known_contacts.find(c => c.id === person_details.id);
            if (found_contact) {
                person_details = found_contact; // Use the more complete data
            } else {
                // Fallback if contact not found (e.g., storage inconsistency)
                person_details.name = `[ID:${person_details.id}]`; // Indicate it's a known ID but details missing
            }
        } else {
            // If it's manual text, store it in the same structure for consistency
            person_details = {
                id: `manual_${Date.now()}`, // Assign a simple unique ID
                name: person_details, // The text value is stored as 'name'
                type: 'text'
            };
        }


        // Create the debt entry
        const new_debt = {
            amount: debtData.amount,
            person: person_details, // Store the structured person details
            description: debtData.description,
            timestamp: new Date().toISOString()
        };

        // Add to user's debts
        get_user_debts(user_id).push(new_debt);
        console.log(`Debt added for user ${user_id}:`, new_debt);


        // Confirmation message
        const person_display_name = person_details.name || "Unknown";
        const action = new_debt.amount >= 0 ? "are owed by" : "owe to";
        const display_amount = Math.abs(new_debt.amount).toFixed(2);

        await ctx.reply(
            `✅ Debt recorded!\n`
            + `You ${action} ${display_amount} ${person_display_name}.\n`
            + `Description: ${new_debt.description || 'None'}.`
        );


    } catch (error) {
        console.error('Error processing web_app_data:', error);
        await ctx.reply('Sorry, there was an error processing your debt data.');
    }
});

// Basic error handling
bot.catch((err, ctx) => {
    console.error(`Oops, encountered an error for ${ctx.update.update_id}`, err);
});


// --- Express Server Setup ---
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the 'webapp' directory
app.use(express.static(path.join(__dirname, 'webapp')));

// Endpoint for the Web App to fetch known contacts
app.get('/get_known_contacts', (req, res) => {
    const userId = req.query.user_id; // Get user ID from query parameters

    // Basic validation - In a real app, validate initData instead!
    if (!userId) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    const knownContacts = get_known_contacts(parseInt(userId, 10)); // Get contacts for the user
    console.log(`Serving ${knownContacts.length} known contacts for user ${userId}`);
    res.json(knownContacts); // Send the list as JSON
});

// Start the Express server and the bot
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch();
    console.log('Bot started.');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));