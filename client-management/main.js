
// **********************************************************
// ******************** Main Entry Point ********************
// **********************************************************

var r2 = setElementTextById("page-title", "Client Management");
appendlLog("Setting text for element with ID 'page-title' returned: " + r2);

var r3 = setElementTextById("page-subtitle", "Manage your clients efficiently");
appendlLog("Setting text for element with ID 'page-subtitle' returned: " + r3);

var r4 = setElementTextById("page-description", "Welcome to the Client Management page");
appendlLog("Setting text for element with ID 'page-description' returned: " + r4);

var clients = [
    new Client(1, "Qiao", "Li", "ql@gmail.com", "1234567890"),
    new Client(2, "Jane", "Smith", "js@abc.com", "0987654321"),
    new Client(3, "Bob", "Johnson", "bj@xyz.com", "5555555555")
];

displayClientTable(clients);




