import { createServer } from "node:http";
import dns from "node:dns";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import { MongoClient } from "mongodb";
import { initialOrders } from "./data/orders.js";
import { products as initialProducts } from "./data/products.js";

const envPath = fileURLToPath(new URL("./.env", import.meta.url));
dotenv.config({ path: envPath, override: true });
dns.setServers((process.env.MONGODB_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",").map((server) => server.trim()));

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || "verdant_store";
const adminEmail = process.env.ADMIN_EMAIL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const googleClient = googleClientId ? new OAuth2Client(googleClientId, googleClientSecret) : null;
const otpMinutes = 10;
const sessionDays = 30;
const orderStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const defaultHomepage = { eyebrow: "✦ THOUGHTFULLY MADE", title: "Good things for a slower life.", intro: "Intentional objects, everyday essentials, and small rituals designed to bring more ease to your day.", image: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=1200&q=90", imageLabel: "THE AUTUMN EDIT · 2026" };
const defaultStoreSettings = { homeDeliveryEnabled: true, announcementEnabled: true, announcementText: "FREE SHIPPING ON ORDERS OVER $100" };
const defaultContact = { heading: "Come say hello.", phone: "+91 98765 43210", email: "hello@verdantgoods.com", address: "12 Garden Lane, Kolkata", hours: "Mon-Sat, 10:00 AM-7:00 PM" };
const mongoClient = mongoUri ? new MongoClient(mongoUri) : null;
const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;

const send = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
};
const razorpayRequest = async (path, options = {}) => fetch(`https://api.razorpay.com/v1${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`, ...(options.headers || {}) } });

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
};
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password, salt = randomBytes(16).toString("hex")) => ({ passwordHash: scryptSync(password, salt, 64).toString("hex"), passwordSalt: salt });
const createOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const sendOtp = async (email, otp) => {
  if (!mailer) throw new Error("SMTP is not configured");
  await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject: "Your Verdant verification code", text: `Your Verdant verification code is ${otp}. It expires in ${otpMinutes} minutes.` });
};
const createSession = async (sessions, userId) => {
  const token = randomBytes(32).toString("hex");
  await sessions.insertOne({ tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000) });
  return token;
};

const start = async () => {
  if (!mongoUri) throw new Error("MONGODB_URI is not configured");
  await mongoClient.connect();
  const database = mongoClient.db(mongoDbName);
  const products = database.collection("products");
  const orders = database.collection("orders");
  const users = database.collection("users");
  const sessions = database.collection("sessions");
  const settings = database.collection("settings");
  const reviews = database.collection("reviews");
  await reviews.createIndex({ productId: 1, userId: 1 }, { unique: true });
  const resolveOrderItems = async (body) => {
    const requestedItems = Array.isArray(body.items) && body.items.length ? body.items : [{ productId: body.productId, quantity: body.quantity }];
    const items = await Promise.all(requestedItems.map(async (item) => ({ product: await products.findOne({ id: Number(item.productId) }, { projection: { _id: 0 } }), quantity: Number(item.quantity) })));
    return items.every(({ product, quantity }) => product && Number.isInteger(quantity) && quantity > 0) ? items : null;
  };
  const productRating = async (productId) => {
    const summary = await reviews.aggregate([{ $match: { productId } }, { $group: { _id: "$productId", average: { $avg: "$rating" }, count: { $sum: 1 } } }]).next();
    return summary ? { average: Math.round(summary.average * 10) / 10, count: summary.count } : { average: null, count: 0 };
  };

  if (await products.countDocuments() === 0) await products.insertMany(initialProducts);
  if (await orders.countDocuments() === 0) await orders.insertMany(initialOrders);
  if (adminEmail) {
    await users.updateOne({ email: adminEmail.toLowerCase() }, { $set: { role: "admin", emailVerified: true }, $setOnInsert: { email: adminEmail.toLowerCase(), createdAt: new Date() } }, { upsert: true });
  }

  const getUser = async (request) => {
    const authorization = request.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) return null;
    const session = await sessions.findOne({ tokenHash: tokenHash(authorization.slice(7)), expiresAt: { $gt: new Date() } });
    return session ? users.findOne({ _id: session.userId }) : null;
  };
  const requireUser = async (request, response, role) => {
    const user = await getUser(request);
    if (!user || (role && user.role !== role)) {
      send(response, 401, { error: "Authentication required" });
      return null;
    }
    return user;
  };

  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname === "/api/health") {
        send(response, 200, { status: "ok", database: "mongodb", databaseName: mongoDbName, collections: ["products", "orders", "users", "sessions"] });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings/homepage") {
        const homepage = await settings.findOne({ _id: "homepage" }, { projection: { _id: 0 } });
        send(response, 200, { ...defaultHomepage, ...(homepage || {}) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings/store") {
        const storeSettings = await settings.findOne({ _id: "store" }, { projection: { _id: 0 } });
        send(response, 200, { ...defaultStoreSettings, ...(storeSettings || {}) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/settings/contact") {
        const contact = await settings.findOne({ _id: "contact" }, { projection: { _id: 0 } });
        send(response, 200, { ...defaultContact, ...(contact || {}) });
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/settings/contact") {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        const contact = { heading: String(body.heading || "").trim(), phone: String(body.phone || "").trim(), email: String(body.email || "").trim(), address: String(body.address || "").trim(), hours: String(body.hours || "").trim() };
        if (!contact.heading || !contact.phone || !contact.email || !contact.address || !contact.hours || contact.heading.length > 100 || contact.email.length > 160 || contact.address.length > 200 || contact.hours.length > 100) {
          send(response, 400, { error: "All contact details are required and must be within their limits" });
          return;
        }
        await settings.replaceOne({ _id: "contact" }, { _id: "contact", ...contact }, { upsert: true });
        send(response, 200, contact);
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/settings/store") {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        const current = await settings.findOne({ _id: "store" });
        const storeSettings = { _id: "store", ...defaultStoreSettings, ...(current || {}), ...body };
        if (typeof storeSettings.homeDeliveryEnabled !== "boolean" || typeof storeSettings.announcementEnabled !== "boolean" || !String(storeSettings.announcementText || "").trim() || String(storeSettings.announcementText).length > 120) { send(response, 400, { error: "Valid delivery and announcement settings are required" }); return; }
        await settings.replaceOne({ _id: "store" }, storeSettings, { upsert: true });
        send(response, 200, { homeDeliveryEnabled: storeSettings.homeDeliveryEnabled, announcementEnabled: storeSettings.announcementEnabled, announcementText: storeSettings.announcementText });
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/settings/homepage") {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        const homepage = { eyebrow: String(body.eyebrow || "").trim(), title: String(body.title || "").trim(), intro: String(body.intro || "").trim(), image: String(body.image || "").trim(), imageLabel: String(body.imageLabel || "").trim() };
        if (!homepage.eyebrow || !homepage.title || !homepage.intro || !homepage.image || !homepage.imageLabel || homepage.title.length > 160 || homepage.intro.length > 300 || homepage.imageLabel.length > 100) {
          send(response, 400, { error: "All homepage hero fields are required and must be within their limits" });
          return;
        }
        await settings.replaceOne({ _id: "homepage" }, { _id: "homepage", ...homepage }, { upsert: true });
        send(response, 200, homepage);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/location/reverse") {
        if (!await requireUser(request, response)) return;
        if (!googleMapsApiKey) {
          send(response, 503, { error: "Google Maps API key is not configured on the server" });
          return;
        }
        const latitude = Number(url.searchParams.get("lat"));
        const longitude = Number(url.searchParams.get("lng"));
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          send(response, 400, { error: "A valid location is required" });
          return;
        }
        const lookupUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        lookupUrl.searchParams.set("latlng", `${latitude},${longitude}`);
        lookupUrl.searchParams.set("key", googleMapsApiKey);
        const lookupResponse = await fetch(lookupUrl);
        const lookup = await lookupResponse.json();
        if (!lookupResponse.ok || lookup.status !== "OK" || !lookup.results?.[0]?.formatted_address) {
          const detail = lookup.error_message ? `Google Maps: ${lookup.error_message}` : `Google Maps returned status ${lookup.status || lookupResponse.status}`;
          send(response, 502, { error: detail });
          return;
        }
        send(response, 200, { address: lookup.results[0].formatted_address });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const body = await readBody(request);
        const email = String(body.email || "").toLowerCase().trim();
        const name = String(body.name || "").trim();
        const password = String(body.password || "");
        const mobile = String(body.mobile || "").trim();
        if (!email) {
          send(response, 400, { error: "A valid email address is required" });
          return;
        }
        if (!name || name.length > 100) {
          send(response, 400, { error: "A name of 100 characters or fewer is required" });
          return;
        }
        if (password.length < 8) {
          send(response, 400, { error: "Password must be at least 8 characters" });
          return;
        }
        if (!/^\+?[0-9 ()-]{8,20}$/.test(mobile)) {
          send(response, 400, { error: "A valid mobile number is required" });
          return;
        }
        if (await users.findOne({ email })) {
          send(response, 409, { error: "An account already exists for this email. Please sign in." });
          return;
        }
        const credentials = hashPassword(password);
        const user = await users.insertOne({ email, name, mobile, ...credentials, role: email === adminEmail?.toLowerCase() ? "admin" : "customer", emailVerified: true, createdAt: new Date() });
        const token = await createSession(sessions, user.insertedId);
        send(response, 201, { token, user: { email, name, mobile, role: email === adminEmail?.toLowerCase() ? "admin" : "customer" } });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/request-otp") {
        const body = await readBody(request);
        const email = String(body.email || "").toLowerCase().trim();
        if (!email || !mailer) { send(response, 400, { error: !email ? "A valid email address is required" : "Email verification is not configured" }); return; }
        let existingUser = await users.findOne({ email });
        if (!existingUser && body.register) {
          const name = String(body.name || "").trim();
          const mobile = String(body.mobile || "").trim();
          if (!name || name.length > 100) { send(response, 400, { error: "A name of 100 characters or fewer is required" }); return; }
          if (!/^\+?[0-9 ()-]{8,20}$/.test(mobile)) { send(response, 400, { error: "A valid mobile number is required" }); return; }
          const result = await users.insertOne({ email, name, mobile, role: email === adminEmail?.toLowerCase() ? "admin" : "customer", emailVerified: false, createdAt: new Date() });
          existingUser = { _id: result.insertedId };
        }
        if (!existingUser) { send(response, 404, { error: "No account found for this email" }); return; }
        const otp = createOtp();
        await users.updateOne({ email }, { $set: { role: email === adminEmail?.toLowerCase() ? "admin" : "customer", verificationCodeHash: tokenHash(otp), verificationExpiresAt: new Date(Date.now() + otpMinutes * 60 * 1000) } });
        await sendOtp(email, otp);
        send(response, 200, { verificationRequired: true, email });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/verify") {
        const body = await readBody(request);
        const email = String(body.email || "").toLowerCase().trim();
        const user = await users.findOne({ email, verificationExpiresAt: { $gt: new Date() } });
        if (!user || tokenHash(String(body.otp || "")) !== user.verificationCodeHash) { send(response, 400, { error: "Invalid or expired verification code" }); return; }
        await users.updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { verificationCodeHash: "", verificationExpiresAt: "" } });
        const token = await createSession(sessions, user._id);
        send(response, 200, { token, user: { email, role: user.role } });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readBody(request);
        const email = String(body.email || "").toLowerCase().trim();
        const password = String(body.password || "");
        const user = await users.findOne({ email });
        if (!email || !password) { send(response, 400, { error: "Email and password are required" }); return; }
        if (!user || !user.passwordHash || !user.passwordSalt || scryptSync(password, user.passwordSalt, 64).toString("hex") !== user.passwordHash) { send(response, 401, { error: "Incorrect email or password" }); return; }
        const token = await createSession(sessions, user._id);
        send(response, 200, { token, user: { email: user.email, mobile: user.mobile || "", role: user.role } });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/google") {
        if (!googleClient) { send(response, 503, { error: "Google Sign-In is not configured" }); return; }
        const body = await readBody(request);
        const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: googleClientId });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.email_verified) { send(response, 401, { error: "Google email is not verified" }); return; }
        const email = payload.email.toLowerCase();
        const result = await users.findOneAndUpdate({ email }, { $set: { email, emailVerified: true, name: payload.name || "", role: email === adminEmail?.toLowerCase() ? "admin" : "customer" }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: "after" });
        const token = await createSession(sessions, result._id);
        send(response, 200, { token, user: { email, role: result.role || "customer" } });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/auth/me") {
        const user = await getUser(request);
        send(response, user ? 200 : 401, user ? { email: user.email, mobile: user.mobile || "", name: user.name || "", address: user.address || "", role: user.role } : { error: "Authentication required" });
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/auth/me") {
        const user = await requireUser(request, response);
        if (!user) return;
        const body = await readBody(request);
        const name = String(body.name || "").trim();
        const address = String(body.address || "").trim();
        const mobile = String(body.mobile || "").trim();
        if (name.length > 100 || address.length > 250 || !/^\+?[0-9 ()-]{8,20}$/.test(mobile)) {
          send(response, 400, { error: name.length > 100 ? "Name must be 100 characters or fewer" : address.length > 250 ? "Address must be 250 characters or fewer" : "A valid mobile number is required" });
          return;
        }
        const updated = await users.findOneAndUpdate({ _id: user._id }, { $set: { name, address, mobile } }, { returnDocument: "after", projection: { email: 1, mobile: 1, name: 1, address: 1, role: 1 } });
        send(response, 200, { email: updated.email, mobile: updated.mobile || "", name: updated.name || "", address: updated.address || "", role: updated.role });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        const productList = await products.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
        send(response, 200, await Promise.all(productList.map(async (product) => ({ ...product, rating: await productRating(product.id) }))));
        return;
      }
      const productDetailsId = Number(url.pathname.match(/^\/api\/products\/(\d+)$/)?.[1]);
      const reviewsProductId = Number(url.pathname.match(/^\/api\/products\/(\d+)\/reviews$/)?.[1]);
      if (request.method === "GET" && Number.isInteger(reviewsProductId)) {
        const user = await getUser(request);
        const productReviews = await reviews.find({ productId: reviewsProductId }, { projection: { _id: 0, userId: 0 } }).sort({ createdAt: -1 }).toArray();
        const ownReview = user ? await reviews.findOne({ productId: reviewsProductId, userId: user._id }, { projection: { _id: 0, userId: 0 } }) : null;
        const purchased = user ? await orders.findOne({ userId: user._id, status: { $ne: "Cancelled" }, $or: [{ productId: reviewsProductId }, { "products.productId": reviewsProductId }] }) : null;
        send(response, 200, { reviews: productReviews, rating: await productRating(reviewsProductId), canReview: Boolean(purchased) && !ownReview, ownReview });
        return;
      }
      if (request.method === "POST" && Number.isInteger(reviewsProductId)) {
        const user = await requireUser(request, response);
        if (!user) return;
        const body = await readBody(request);
        const rating = Number(body.rating);
        const text = String(body.text || "").trim();
        const purchased = await orders.findOne({ userId: user._id, status: { $ne: "Cancelled" }, $or: [{ productId: reviewsProductId }, { "products.productId": reviewsProductId }] });
        if (!purchased) { send(response, 403, { error: "Purchase this product before reviewing it" }); return; }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 500) { send(response, 400, { error: "Choose a rating from 1 to 5 and write up to 500 characters" }); return; }
        const review = { productId: reviewsProductId, userId: user._id, name: user.name || user.email, rating, text, createdAt: new Date().toISOString() };
        try { await reviews.insertOne(review); } catch (error) { if (error.code !== 11000) throw error; send(response, 409, { error: "You have already reviewed this product" }); return; }
        send(response, 201, { ...review, userId: undefined, rating: await productRating(reviewsProductId) });
        return;
      }
      if (request.method === "GET" && Number.isInteger(productDetailsId)) {
        if (!await requireUser(request, response)) return;
        const product = await products.findOne({ id: productDetailsId }, { projection: { _id: 0 } });
        send(response, product ? 200 : 404, product ? { ...product, rating: await productRating(productDetailsId) } : { error: "Product not found" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/products") {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        if (!body.name || !body.type || !body.image || !Number.isFinite(Number(body.price))) {
          send(response, 400, { error: "Name, category, price, and image are required" });
          return;
        }
        const lastProduct = await products.findOne({}, { sort: { id: -1 } });
        const images = Array.isArray(body.images) ? body.images.map((image) => String(image).trim()).filter(Boolean) : [];
        const product = { id: (lastProduct?.id || 0) + 1, name: body.name, type: body.type, price: Number(body.price), image: body.image, images, stockStatus: body.stockStatus || "In stock", description: body.description || "Thoughtfully made for everyday living." };
        await products.insertOne(product);
        send(response, 201, product);
        return;
      }
      const productId = Number(url.pathname.match(/^\/api\/products\/(\d+)$/)?.[1]);
      if (request.method === "PATCH" && Number.isInteger(productId)) {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        const stockStatuses = ["In stock", "Low stock", "Out of stock"];
        const name = String(body.name || "").trim();
        const image = String(body.image || "").trim();
        const description = String(body.description || "").trim();
        const images = Array.isArray(body.images) ? body.images.map((imageUrl) => String(imageUrl).trim()).filter(Boolean) : [];
        if (!name || name.length > 120 || !image || !Number.isFinite(Number(body.price)) || Number(body.price) < 0 || !stockStatuses.includes(body.stockStatus) || description.length > 1000) {
          send(response, 400, { error: "Valid product details, price, image, and stock status are required" });
          return;
        }
        const updated = await products.findOneAndUpdate({ id: productId }, { $set: { name, type: String(body.type || "Home"), price: Number(body.price), image, images, stockStatus: body.stockStatus, description } }, { returnDocument: "after", projection: { _id: 0 } });
        if (!updated) { send(response, 404, { error: "Product not found" }); return; }
        send(response, 200, updated);
        return;
      }
      if (request.method === "DELETE" && Number.isInteger(productId)) {
        if (!await requireUser(request, response, "admin")) return;
        const result = await products.deleteOne({ id: productId });
        if (!result.deletedCount) {
          send(response, 404, { error: "Product not found" });
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/orders") {
        const user = await requireUser(request, response);
        if (!user) return;
        const filter = user.role === "admin" ? {} : { userId: user._id };
        const orderList = await orders.find(filter, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
        const enrichedOrders = await Promise.all(orderList.map(async (order) => {
          if (order.mobile || !order.userId) return order;
          const orderUser = await users.findOne({ _id: order.userId }, { projection: { mobile: 1 } });
          const mobile = orderUser?.mobile || "";
          if (mobile) await orders.updateOne({ id: order.id }, { $set: { mobile } });
          return { ...order, mobile };
        }));
        send(response, 200, enrichedOrders);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/payments/order") {
        const user = await requireUser(request, response);
        if (!user) return;
        if (!razorpayKeyId || !razorpayKeySecret) { send(response, 503, { error: "Razorpay is not configured on the server" }); return; }
        const body = await readBody(request);
        const paymentMethod = String(body.paymentMethod || "");
        const deliveryCharge = paymentMethod === "online_delivery" ? 100 : 0;
        const address = String(body.address || "").trim();
        const storeSettings = await settings.findOne({ _id: "store" });
        const orderItems = await resolveOrderItems(body);
        if (!orderItems || !user.name || !user.email || !["online_store", "online_delivery"].includes(paymentMethod) || (paymentMethod === "online_delivery" && (!address || storeSettings?.homeDeliveryEnabled === false))) { send(response, 400, { error: "Valid products, payment method, profile details, and quantities are required" }); return; }
        const subtotal = orderItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const amount = (subtotal + deliveryCharge) * 100;
        const razorpayResponse = await razorpayRequest("/orders", { method: "POST", body: JSON.stringify({ amount, currency: "INR", receipt: `verdant_${Date.now()}`, notes: { productIds: orderItems.map(({ product }) => product.id).join(","), userId: String(user._id) } }) });
        const razorpayOrder = await razorpayResponse.json();
        if (!razorpayResponse.ok) { send(response, 502, { error: razorpayOrder.error?.description || "Unable to start payment" }); return; }
        send(response, 200, { keyId: razorpayKeyId, orderId: razorpayOrder.id, amount, currency: "INR" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/orders") {
        const user = await requireUser(request, response);
        if (!user) return;
        const body = await readBody(request);
        const address = String(body.address || "").trim();
        const paymentMethod = String(body.paymentMethod || "");
        const paymentMethods = ["cash_store", "online_store", "online_delivery"];
        const deliveryCharge = paymentMethod === "online_delivery" ? 100 : 0;
        const paidMethods = ["online_store", "online_delivery"];
        const storeSettings = await settings.findOne({ _id: "store" });
        const orderItems = await resolveOrderItems(body);
        if (!orderItems || !user.name || !user.email || (paymentMethod === "online_delivery" && (!address || storeSettings?.homeDeliveryEnabled === false)) || !paymentMethods.includes(paymentMethod) || (paidMethods.includes(paymentMethod) && (!body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature))) {
          send(response, 400, { error: "Products, payment method, profile details, and valid quantities are required" });
          return;
        }
        const subtotal = orderItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        if (paidMethods.includes(paymentMethod)) {
          if (!razorpayKeyId || !razorpayKeySecret) { send(response, 503, { error: "Razorpay is not configured on the server" }); return; }
          const expectedSignature = createHmac("sha256", razorpayKeySecret).update(`${body.razorpayOrderId}|${body.razorpayPaymentId}`).digest("hex");
          const signaturesMatch = expectedSignature.length === String(body.razorpaySignature).length && timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(String(body.razorpaySignature)));
          if (!signaturesMatch) { send(response, 400, { error: "Payment verification failed" }); return; }
          const paymentOrderResponse = await razorpayRequest(`/orders/${encodeURIComponent(body.razorpayOrderId)}`);
          const paymentOrder = await paymentOrderResponse.json();
          const expectedAmount = (subtotal + deliveryCharge) * 100;
          if (!paymentOrderResponse.ok || paymentOrder.amount !== expectedAmount || paymentOrder.currency !== "INR") { send(response, 400, { error: "Payment amount verification failed" }); return; }
        }
        const lastOrder = await orders.findOne({}, { sort: { id: -1 } });
        const nextNumber = Math.max(...(String(lastOrder?.id || "ORD-1000").match(/\d+/g) || ["1000"]).map(Number)) + 1;
        const orderDate = new Date();
        const order = { id: `ORD-${nextNumber}`, userId: user._id, customer: user.name, email: user.email, mobile: user.mobile || "", address, paymentMethod, deliveryCharge, items: orderItems.map(({ product, quantity }) => `${product.name} × ${quantity}`).join(", "), products: orderItems.map(({ product, quantity }) => ({ productId: product.id, quantity, price: product.price })), total: subtotal + deliveryCharge, status: "Pending", paymentStatus: paidMethods.includes(paymentMethod) ? "Paid" : "Pending", paymentDate: paidMethods.includes(paymentMethod) ? orderDate.toISOString() : null, createdAt: orderDate.toISOString() };
        await orders.insertOne(order);
        send(response, 201, order);
        return;
      }
      const orderId = url.pathname.match(/^\/api\/orders\/([^/]+)$/)?.[1];
      if (request.method === "PATCH" && orderId) {
        if (!await requireUser(request, response, "admin")) return;
        const body = await readBody(request);
        const paymentStatuses = ["Pending", "Paid", "Failed", "Refunded"];
        if (body.status !== undefined && !orderStatuses.includes(body.status)) {
          send(response, 400, { error: "Invalid order status" });
          return;
        }
        if (body.paymentStatus !== undefined && !paymentStatuses.includes(body.paymentStatus)) {
          send(response, 400, { error: "Invalid payment status" });
          return;
        }
        const updates = {};
        if (body.status !== undefined) updates.status = body.status;
        if (body.paymentStatus !== undefined) {
          updates.paymentStatus = body.paymentStatus;
          updates.paymentDate = body.paymentStatus === "Paid" ? new Date().toISOString() : null;
        }
        if (Object.keys(updates).length === 0) {
          send(response, 400, { error: "An order or payment status is required" });
          return;
        }
        const result = await orders.findOneAndUpdate({ id: orderId }, { $set: updates }, { returnDocument: "after", projection: { _id: 0 } });
        if (!result) {
          send(response, 404, { error: "Order not found" });
          return;
        }
        send(response, 200, result);
        return;
      }
      send(response, 404, { error: "Not found" });
    } catch (error) {
      console.error("API request failed:", error);
      send(response, 500, { error: "Internal server error" });
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Backend port ${port} is already in use. Stop the existing backend or use a different PORT.`);
      process.exit(1);
    }
    throw error;
  });
  server.listen(port, host, () => console.log(`Backend API running at http://localhost:${port} using MongoDB`));
};

start().catch((error) => {
  if (!existsSync(envPath)) {
    console.error("backend/.env is missing. Copy backend/.env.example to backend/.env and add your Atlas URI.");
  } else if (!mongoUri) {
    console.error("MONGODB_URI is missing in backend/.env. Add your MongoDB Atlas connection string.");
  } else {
    console.error("Unable to connect to MongoDB Atlas. Check the URI and Atlas network access settings.");
  }
  console.error(error.message);
  process.exit(1);
});
