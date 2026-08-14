// Function name: setElementTextById
// Description: sets the text of an element with the given ID
// Parameter: elementId - the ID of the element to set the text for
// Parameter: text - the text to set for the element
// Return: value true: means successful - if element is found
//               false: means failed - if element is not found
export function setElementTextById(elementId, text) {

    var element = document.getElementById(elementId);
    var result = "unknown"; //default value

    if (element === null) {
        result = "failed"; //element not found
    } else {
        element.innerHTML = text;
        result = "success";
    }

    return result;
}


// Function name: appendlLog
// Description: appends a log message to the log element
// Parameter: log - the log message to append
// Return: none
export function appendlLog(log) {
    document.getElementById("log").innerHTML += "<br />" + log;
    return;
}

export function displayClientTable(clients) {
    var tBodyElement = document.getElementById("client-table-body");
    var bodyHtml = "";
    clients.forEach(client => {
        bodyHtml += "<tr>";
        bodyHtml +=     "<td>" + client.id + "</td>";
        bodyHtml +=     "<td>" + client.getFullName() + "</td>";
        bodyHtml +=     "<td>" + client.email + "</td>";
        bodyHtml +=     "<td>" + client.phoneNumber + "</td>";
        bodyHtml += "</tr>";
    });

    tBodyElement.innerHTML = bodyHtml;
}
