const mongoose = require("mongoose");

const productDetailsSchema = new mongoose.Schema({
  product_id: String,
  trimester: Number,
  month: Number,
  week:Number
});

const ProductDetails = mongoose.model("productDetails", productDetailsSchema);

module.exports = ProductDetails;
