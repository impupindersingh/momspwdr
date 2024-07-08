require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const Event = require("./modal/orderSchema");
const ProductDetails = require("./modal/productSchema");
const subsUserData = require("./modal/subsSchema");
const cron = require("node-cron");
const moment = require("moment");
const timezone = require("moment-timezone");
const { default: mongoose } = require("mongoose");
const Subscription = require("./modal/subsSchema");

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
          paymentMethod
        currency
        paidAmount
          orderedProducts {
             id
              productId
              quantity
              recurring
              shipmentDate
              status
              title
              metadata
            priceExcludingTaxCents
            priceIncludingTaxCents
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
function saveDataInProfitMetrics(data) {
  try {
    let newObj = {
      id: data.id,
      ts: Math.floor(new Date(data.activatedAt).getTime() / 1000),
      orderEmail: data.email,
      shippingMethod: "UPS Nextday",
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      priceTotalExVat:
        data.orderedProducts.reduce(
          (total, item) => total + item.priceExcludingTaxCents,
          0
        ) / 100,
      priceTotalInclVat:
        data.orderedProducts.reduce(
          (total, item) => total + item.priceIncludingTaxCents,
          0
        ) / 100,
      products: data.orderedProducts.map((x) => ({
        sku: x.productId,
        qty: x.quantity,
        priceExVat: x.priceExcludingTaxCents / 100,
      })),
    };
    console.log(JSON.stringify(newObj),"object for the profitmetrics object");
    let url = `https://my.profitmetrics.io/l.php?v=3uh&pid=${process.env.PUBLIC_ID}&o=${JSON.stringify(newObj)}`;
    console.log(url,"url logs")
    fetch(url)
      .then((response) => {
        console.log(response,"response")
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return "success";
      })
      .then((data) => {
        console.log("API Response:", data);
        // Handle response data as needed
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
        // Handle errors
      });
    // console.log(newObj);
  } catch (error) {
    console.log(error);
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
    console.log(bodyData);
    if (!Object.keys(req.body).length) {
      res.status(201).send("Body is empty!");
    }
    if (Object.keys(req.body).length && bodyData.order) {
      let orderData = await subsData(bodyData.order.token);
      saveDataInProfitMetrics(orderData);
      // for (let orderedProduct of orderData.orderedProducts) {
      //   orderedProduct.week = orderedProduct.metadata.month;
      // }
      // if (orderData) {
      //   orderData.token = bodyData.order.token;
      //   orderData.shipDate = bodyData.order.shipment_date;
      //   orderData.next_delivery = moment(bodyData.order.shipment_date)
      //     .add(1, "M")
      //     .format("YYYY-MM-DD");
      // }
      // const event = new Event(orderData);
      // await event.save();
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
  const updatedData = req.body.subscription;
  try {
    const filter = { id: updatedData.id };
    const update = { $set: { status: updatedData.status } };
    const result = await Event.updateOne(filter, update);
    res.status(201).send("Subscription paused");
  } catch (error) {
    console.log("error", error);
  }
});

const userData = async () => {
  const projectAccessToken = process.env.process_token;
  // const subscriptionToken = token;
  const graphql = JSON.stringify({
    query: `query Subscriptions {
      subscriptions(last: 30) {
          totalCount
          nodes {
              zipcode
              status
              orderedProducts {
                id
                productId
                quantity
                recurring
                status
                title
            }
          }
      }
  }`,
  });
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Access-Token": projectAccessToken,
    },
    body: graphql,
  };
  const response = await fetch(process.env.url, requestOptions);
  const data = await response.json();

  return data.data.subscriptions.nodes;
};
app.post("/subs", async (req, res) => {
  try {
    const getUserData = await userData();
    console.log(getUserData);
    const cancelledSubscriptions = getUserData.filter(
      (sub) => sub.status === "CANCELLED"
    );
    // await subsUserData.insertMany(cancelledSubscriptions)
    res.status(200).send(cancelledSubscriptions);
  } catch (error) {
    console.log(error);
  }
});

async function processProductId(productId) {
  console.log(`Processing product ID: ${productId}`);
  // Your logic here
  const projectAccessToken = process.env.process_token;
  // const subscriptionToken = token;
  const graphql = JSON.stringify({
    query: `mutation DestroyOrderedProduct($id: ID!) {
      destroyOrderedProduct(input: {id: $id}) {
          clientMutationId  
      }
  }`,
    variables: {
      id: productId,
    },
  });
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Project-Access-Token": projectAccessToken,
    },
    body: graphql,
  };
  const response = await fetch(process.env.url, requestOptions);
  const data = await response.json();
  console.log(data, "**********************888");

  return response.status;
}
app.get("/userData", async (req, res) => {
  try {
    const allQueries = [];
    const cancelledSubscriptions = await Subscription.find(
      { status: "CANCELLED" },
      { "orderedProducts.id": 1 }
    ).lean();
    cancelledSubscriptions.forEach((sub) => {
      sub.orderedProducts.forEach((product) => {
        let updatePromise = processProductId(product.id);
        allQueries.push(updatePromise);
      });
    });
    // processProductId("12716108")
    const results = await Promise.all(allQueries);
    console.log(results, "response of promise");
    res.send(cancelledSubscriptions).status(200);
  } catch (error) {
    console.log(error);
  }
});
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
