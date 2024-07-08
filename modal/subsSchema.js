const mongoose = require("mongoose");

const OrderedProductSchema = new mongoose.Schema({
  id: String,
  productId: String,
  quantity: Number,
  recurring: Boolean,
  status: String,
  title: String,
});

const SubscriptionSchema = new mongoose.Schema({
  zipcode: String,
  status: String,
  orderedProducts: [OrderedProductSchema],
});

const Subscription = mongoose.model("Subscription", SubscriptionSchema);

module.exports = Subscription;
