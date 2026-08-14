// OOP 4 concepts: 
// encapsulation (must have) = properties and methods
// inheritance = class extends another class
// polymorphism = method overriding
// abstraction = hiding implementation details


// Client has 
// properties:
//     1. id
//     2. first name
//     3. last name
//     4. email
//     5. phone number
// methods
//     1. getFullName() - first name + " " + last name

class Client {
    constructor(id, firstName, lastName, email, phoneNumber) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phoneNumber = phoneNumber;
    }

    // Method name: getFullName
    // Description: returns the full name of the client
    // Return: string - full name of the client
    getFullName() {
        return this.firstName + " " + this.lastName;
    }
}