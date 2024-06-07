require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const Event = require("./modal/orderSchema");
const ProductDetails = require("./modal/productSchema");
const cron = require("node-cron");
const moment = require("moment");
const timezone = require("moment-timezone");
const { default: mongoose } = require("mongoose");

// const { subsData } = require('./service/subscription');
const app = express();
const port = process.env.PORT;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const url = process.env.mongodb_uri;
mongoose.connect(url);
mongoose.connection.on("connected", () => console.log("connected"));
const subsData = async (token) => {
  const projectAccessToken = process.env.process_token;
  const subscriptionToken = token;
  const graphql = JSON.stringify({
    query: `query GetSubscription($token: ID!)  {
      getSubscription(token: $token) {
          activatedAt
          email
          fullAddress
          fullName
          houseNumber
          id
          lastName
          name
          status
          orderedProducts {
              id
              productId
              quantity
              recurring
              shipmentDate
              status
              title
              metadata
          }
      }
  }`,
    variables: {
      token: token,
    },
  });
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Access-Token": projectAccessToken,
      "X-Subscription-Token": subscriptionToken,
    },
    body: graphql,
  };
  const response = await fetch(process.env.url, requestOptions);
  const data = await response.json();

  return data.data.getSubscription;
};
const updateOrderProduct = async (prod, token) => {
  const projectAccessToken = process.env.process_token;
  const subscriptionToken = token;
  const graphql = JSON.stringify({
    query: `mutation UpdateOrderedProduct($id: ID!, $productId: ID!) {
      updateOrderedProduct(input: { id: $id, productId: $productId }) {
        clientMutationId
      }
    }`,
    variables: {
      id: prod.id,
      productId: prod.productId,
    },
  });
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Access-Token": projectAccessToken,
      "X-Subscription-Token": subscriptionToken,
    },
    body: graphql,
  };
  const response = await fetch(process.env.url, requestOptions);
  return response.status;
};
async function updateOrders() {
  try {
    // Fetch all orders from the database
    const orders = await Event.find({
      next_delivery: moment().add(1, "days").format("YYYY-MM-DD"),
    });
    const productDetail = await ProductDetails.find({});

    const productData = {
      4: "177989",
      7: "177990",
    };
    const bulkOps = [];
    const updatePromises = [];
    for (const order of orders) {
      // Update week values based on the conditions
      if (order.status.toUpperCase() !== "ACTIVATED") return;
      order.orderedProducts.forEach(async (product) => {
        if (product.recurring && product.week > 0) {
          if (product.week < 10) {
            product.week += 1;
          }
        }
        if (product.week === 4 || product.week === 7) {
          let newProd = productData[`${product.week}`];
          product.productId = newProd;
          let updatePromise = updateOrderProduct(product, order.token);
          updatePromises.push(updatePromise);
        }
      });
      const nextDeliveryDate = moment(order.next_delivery)
        .add(1, "months")
        .format("YYYY-MM-DD");
      order.next_delivery = nextDeliveryDate;
      // Save the updated order
      // Add the update operation to the bulkOps array
      bulkOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: {
            $set: {
              orderedProducts: order.orderedProducts,
              next_delivery: order.next_delivery,
            },
          },
        },
      });
    }

    if (bulkOps.length > 0) {
      try {
        const results = await Promise.all(updatePromises);
        await Event.bulkWrite(bulkOps);
      } catch (err) {
        console.error("Error updating orders:", err);
      }
    }
  } catch (error) {
    console.error("Error updating orders:", error);
  }
}

cron.schedule(
  "0 0 * * *",
  () => {
    updateOrders();
  },
  {
    scheduled: true,
    timezone: process.env.timezone,
  }
);

app.get("/", async (req, res) => {
  // updateOrders();
  res.send("ok");
});
app.post("/hook", async (req, res) => {
  try {
    let bodyData = req.body;
    if (bodyData.order) {
      let orderData = await subsData(bodyData.order.token);
      for (let orderedProduct of orderData.orderedProducts) {
        orderedProduct.week = orderedProduct.metadata.month;
      }
      if (orderData) {
        orderData.token = bodyData.order.token;
        orderData.shipDate = bodyData.order.shipment_date;
        orderData.next_delivery = moment(bodyData.order.shipment_date)
          .add(1, "M")
          .format("YYYY-MM-DD");
      }
      const event = new Event(orderData);
      await event.save();
      res.status(201).send("Order saved successfully!");
    }
  } catch (error) {
    console.error("Error saving event:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/cancel", async (req, res) => {
  try {
    if (req.body.subscription) {
      await Event.deleteOne({ id: req.body.subscription.id });
    }
    res.status(201).send("Subscription canceled successfully!");
  } catch (error) {
    console.log(error);
  }
});
app.post("/pause", async (req, res) => {
  const updatedData = req.body.subscription
  try {
    const filter = { id:  updatedData.id};
    const update = { $set: { status: updatedData.status } };
    const result = await Event.updateOne(filter, update);
    res.status(201).send("Subscription paused");
  } catch (error) {
    console.log("error", error);
  }
});
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
