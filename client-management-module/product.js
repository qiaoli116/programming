// product has id, name, description, price, quantity
// methods: getTotalPrice() - price * quantity
export class Product{
    constructor(id, name, description, price, quantity) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.quantity = quantity;
    }
    getTotalPrice() {
        return this.price * this.quantity;
    }
}
