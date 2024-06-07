// models/Event.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    id: String,
    name: String,
    trimester: String,
    month: String,
    subsId :String
});
const subsDataSchema = new mongoose.Schema({
  id:String
})
const OrderedProductSchema = new mongoose.Schema({
  id: String,
  productId: String,
  quantity: Number,
  recurring: Boolean,
  shipmentDate: Date,
  status: String,
  title: String,
  // trimester:Number,
  // month:Number,
  week:Number
});
const orderSchema = new mongoose.Schema({
  activatedAt: Date,
  email: String,
  fullAddress: String,
  fullName: String,
  houseNumber: String,
  id: String,
  lastName: String,
  name: String,
  token:String,
  shipDate:Date,
  next_delivery:Date,
  status:String,
  orderedProducts: [OrderedProductSchema]
});

// const subscriptionSchema = new mongoose.Schema({
//   id: String,
// });

const eventSchema = new mongoose.Schema({ 
  event: String,
  order: orderSchema,
  // subscription: subscriptionSchema,
});

const Event = mongoose.model('event', orderSchema);

module.exports = Event;
