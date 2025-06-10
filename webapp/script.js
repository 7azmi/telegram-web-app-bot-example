// Initialize Telegram Web App
Telegram.WebApp.ready();

// Get user_id from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id');

let knownContacts = []; // Array to store contacts fetched from the bot

// Access form elements
const debtForm = document.getElementById('debtForm');
const amountInput = document.getElementById('amount');
const knownPersonSelect = document.getElementById('knownPersonSelect'); // New select element
const manualPersonInput = document.getElementById('manualPersonInput'); // Existing text input
const descriptionInput = document.getElementById('description');
const submitBtn = document.getElementById('submitBtn');
const personLinkContainer = document.getElementById('personLinkContainer'); // Container for the user link

// Optional: Use Telegram's MainButton
if (Telegram.WebApp.MainButton) {
    Telegram.WebApp.MainButton.setText('Record Debt');
    Telegram.WebApp.MainButton.onClick(sendData);
    // Initially hide or disable until form is valid
    Telegram.WebApp.MainButton.hide(); // Will show on form input later
    // Or show initially and manage disabled state if needed:
    // Telegram.WebApp.MainButton.show();
    // Telegram.WebApp.MainButton.disable(); // Add validation logic to enable/disable
}


// --- Functions ---

// Function to fetch known contacts from the bot
async function fetchKnownContacts(userId) {
    if (!userId) {
        console.error("User ID not available to fetch contacts.");
        return;
    }
    try {
        // Fetch from the bot's Express endpoint
        // Note: Use the correct path relative to your server root or absolute URL if needed
        const response = await fetch(`/get_known_contacts?user_id=${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        knownContacts = await response.json();
        populateKnownContactsSelect(knownContacts);
        console.log("Fetched known contacts:", knownContacts);

    } catch (error) {
        console.error("Error fetching known contacts:", error);
        // Optionally display an error message to the user in the app
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "Error loading contacts";
        knownPersonSelect.appendChild(option);
        knownPersonSelect.disabled = true;
    }
}

// Function to populate the dropdown
function populateKnownContactsSelect(contacts) {
    knownPersonSelect.innerHTML = '<option value="">-- Select a person --</option>'; // Clear existing options
    contacts.forEach(contact => {
        const option = document.createElement('option');
        option.value = contact.id; // Use the unique ID provided by the bot
        option.textContent = contact.name; // Display the name
        knownPersonSelect.appendChild(option);
    });
}

// Function to show/hide manual input and handle selection logic
function handleSelectionChange() {
    const selectedKnownId = knownPersonSelect.value;

    if (selectedKnownId) {
        // A known contact is selected
        manualPersonInput.disabled = true; // Disable manual input
        manualPersonInput.value = ''; // Clear manual input
        manualPersonInput.placeholder = 'Selected from list';

        // Find the selected contact object
        const selectedContact = knownContacts.find(c => c.id === selectedKnownId);

        // Display Telegram user link if available
        personLinkContainer.innerHTML = ''; // Clear previous link
        if (selectedContact && selectedContact.telegram_user_id) {
            const link = document.createElement('a');
            link.href = `tg://user?id=${selectedContact.telegram_user_id}`;
            link.textContent = `Open chat with ${selectedContact.name}`;
            link.target = '_blank'; // Recommended for tg:// links
            personLinkContainer.appendChild(link);
        }

    } else {
        // No known contact selected, enable manual input
        manualPersonInput.disabled = false;
        manualPersonInput.placeholder = 'e.g., Alice, @alice_tg, 123-456-7890';
        personLinkContainer.innerHTML = ''; // Hide the link container
    }
    validateForm(); // Re-validate the form on selection change
}

// Basic form validation check (client-side)
function validateForm() {
    const isAmountValid = amountInput.value !== '' && !isNaN(parseFloat(amountInput.value));
    const isPersonSelectedOrEntered = knownPersonSelect.value !== '' || manualPersonInput.value.trim() !== '';
    const isValid = isAmountValid && isPersonSelectedOrEntered;

    if (Telegram.WebApp.MainButton) {
        if (isValid) {
            Telegram.WebApp.MainButton.enable();
            Telegram.WebApp.MainButton.show(); // Ensure it's visible once valid
        } else {
            Telegram.WebApp.MainButton.disable();
            // Optionally hide if not valid
            // Telegram.WebApp.MainButton.hide();
        }
    } else {
        // If not using MainButton, enable/disable the HTML button
        submitBtn.disabled = !isValid;
    }

    return isValid;
}


// Function to send data back to the bot
function sendData() {
    if (validateForm()) { // Check validity before sending
        const amount = parseFloat(amountInput.value);
        const description = descriptionInput.value.trim();

        let personData;
        const selectedKnownId = knownPersonSelect.value;

        if (selectedKnownId) {
            // Send the ID and type of the selected known contact
            personData = {
                id: selectedKnownId,
                type: 'known'
            };
            // Optional: Include name for easier debugging on bot side,
            // but bot should ideally look up full details by ID
            const selectedContact = knownContacts.find(c => c.id === selectedKnownId);
            if (selectedContact) {
                personData.name = selectedContact.name;
            }

        } else {
            // Send the manual text input
            personData = manualPersonInput.value.trim(); // Send the raw text for manual entry
        }


        // Construct the data object
        const dataToSend = {
            amount: amount,
            person: personData, // This now sends the structured person data or text
            description: description,
            // You could also include other initDataUnsafe fields if needed
            // user_id: Telegram.WebApp.initDataUnsafe.user ? Telegram.WebApp.initDataUnsafe.user.id : null
        };

        // Send data as a JSON string
        Telegram.WebApp.sendData(JSON.stringify(dataToSend));

        // Optional: Close the web app after sending
        // Telegram.WebApp.close();

    } else {
        console.log('Form is not valid. Cannot send data.');
        // You could show custom error messages here if validateForm doesn't trigger native browser messages sufficiently
    }
}

// --- Event Listeners ---

// Listen for changes in the dropdown
knownPersonSelect.addEventListener('change', handleSelectionChange);

// Listen for input in the manual text field (needed if dropdown is not used)
manualPersonInput.addEventListener('input', handleSelectionChange);
// Also listen for input on amount/description to enable MainButton
amountInput.addEventListener('input', validateForm);
descriptionInput.addEventListener('input', validateForm); // Description is optional, but input triggers check


// Listen for form submission (fallback if MainButton is not used or is hidden)
debtForm.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent default form submission
    sendData(); // Use the sendData function
});

// --- Initial Setup ---
// Fetch known contacts when the app is ready
fetchKnownContacts(userId);
// Initial validation check
validateForm();