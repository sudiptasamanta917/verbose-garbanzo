import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useToast } from "./Toast";

const apiUrl = import.meta.env.VITE_API_URL || "";
const deliveryCharge = 100;
const paymentOptions = [
  { value: "cash_store", label: "Pay cash and collect from store", detail: "Pay when you collect your order." },
  { value: "online_store", label: "Pay now and collect from store", detail: "Complete payment online, then collect from our store." },
  { value: "online_delivery", label: "Pay now and get home delivery", detail: `Online payment with ₹${deliveryCharge} delivery charge.` },
];

export default function CheckoutPage() {
  const [checkout, setCheckout] = useState(null);
  const [product, setProduct] = useState(null);
  const [checkoutItems, setCheckoutItems] = useState([]);
  const [homeDeliveryEnabled, setHomeDeliveryEnabled] = useState(true);
  const [profile, setProfile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash_store");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const savedCheckout = sessionStorage.getItem("verdant_checkout");
    if (!savedCheckout) { setMessage("Your checkout session has expired. Please select the product again."); toast("Your checkout session has expired.", "error"); return; }
    try {
      const pending = JSON.parse(savedCheckout);
      const headers = { Authorization: `Bearer ${localStorage.getItem("verdant_token")}` };
      const productRequest = pending.items ? Promise.all(pending.items.map((item) => fetch(`${apiUrl}/api/products/${item.productId}`, { headers }))) : fetch(`${apiUrl}/api/products/${pending.productId}`, { headers });
      Promise.all([productRequest, fetch(`${apiUrl}/api/auth/me`, { headers }), fetch(`${apiUrl}/api/settings/store`)] )
        .then(async ([productResponse, profileResponse, storeResponse]) => {
          const productResponses = pending.items ? productResponse : [productResponse];
          if (productResponses.some((response) => !response.ok)) throw new Error("Product not found");
          if (!profileResponse.ok) throw new Error("Unable to load your profile");
          const products = await Promise.all(productResponses.map((response) => response.json()));
          setProduct(products[0]);
          setCheckoutItems(products.map((item, index) => ({ ...item, quantity: pending.items ? pending.items[index].quantity : pending.quantity })));
          setProfile(await profileResponse.json());
          if (storeResponse.ok) setHomeDeliveryEnabled((await storeResponse.json()).homeDeliveryEnabled !== false);
          setCheckout(pending);
        })
        .catch((error) => { setMessage(error.message); toast(error.message, "error"); });
    } catch {
      setMessage("Unable to restore your checkout."); toast("Unable to restore your checkout.", "error");
    }
  }, []);

  useEffect(() => {
    if (!homeDeliveryEnabled && paymentMethod === "online_delivery") setPaymentMethod("cash_store");
  }, [homeDeliveryEnabled, paymentMethod]);

  const submitOrder = async (paymentDetails = {}) => {
    const response = await fetch(`${apiUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("verdant_token")}` },
      body: JSON.stringify({ ...checkout, paymentMethod, ...paymentDetails }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to place your order.");
    sessionStorage.removeItem("verdant_checkout");
    setMessage(`Order ${data.id} placed successfully.`); toast(`Order ${data.id} placed successfully.`); window.setTimeout(() => { window.location.href = "/"; }, 900);
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    if (paymentMethod === "online_delivery" && !checkout.address?.trim()) {
      setMessage("Add a delivery location before choosing home delivery."); toast("Add a delivery location before continuing.", "error");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      if (paymentMethod === "cash_store") {
        await submitOrder();
        return;
      }
      const script = document.querySelector("script[src='https://checkout.razorpay.com/v1/checkout.js']") || document.createElement("script");
      if (!script.src) { script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; document.body.appendChild(script); }
      await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error("Unable to load payment gateway.")); if (window.Razorpay) resolve(); });
      const paymentResponse = await fetch(`${apiUrl}/api/payments/order`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("verdant_token")}` }, body: JSON.stringify({ ...checkout, paymentMethod }) });
      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(paymentData.error || "Unable to start payment.");
      const gateway = new window.Razorpay({ key: paymentData.keyId, amount: paymentData.amount, currency: paymentData.currency, name: "Verdant", description: product.name, order_id: paymentData.orderId, prefill: { name: profile.name, email: profile.email, contact: profile.mobile }, theme: { color: "#80914a" }, modal: { ondismiss: () => setSubmitting(false) }, handler: async (result) => {
        try { await submitOrder({ razorpayOrderId: result.razorpay_order_id, razorpayPaymentId: result.razorpay_payment_id, razorpaySignature: result.razorpay_signature }); } catch (error) { setMessage(error.message); toast(error.message, "error"); } finally { setSubmitting(false); }
      } });
      gateway.on("payment.failed", () => { setMessage("Payment was not completed. Please try again."); toast("Payment was not completed.", "error"); setSubmitting(false); });
      gateway.open();
      return;
    } catch (error) {
      setMessage(error.message); toast(error.message, "error");
    } finally {
      if (paymentMethod === "cash_store") setSubmitting(false);
    }
  };

  const homeDelivery = paymentMethod === "online_delivery";
  const subtotal = checkoutItems.length ? checkoutItems.reduce((sum, item) => sum + item.price * item.quantity, 0) : product && checkout ? product.price * checkout.quantity : 0;
  const total = subtotal + (homeDelivery ? deliveryCharge : 0);

  const availablePaymentOptions = paymentOptions.filter((option) => option.value !== "online_delivery" || homeDeliveryEnabled);
  return <><Navbar /><main className="checkout-page"><a className="back-link" href={checkout?.items ? "/#shop" : checkout ? `/product/${checkout.productId}` : "/"}>← Back to shopping</a><div className="checkout-layout"><section><p className="eyebrow">CHECKOUT</p><h1>Choose how you’ll receive it.</h1>{checkoutItems.map((item) => <div className="checkout-product" key={item.id}><img src={item.image} alt={item.name} /><div><h2>{item.name}</h2><p>Quantity: {item.quantity}</p><strong>₹{item.price * item.quantity}</strong></div></div>)}<form className="payment-options" onSubmit={placeOrder}><h2>Payment and collection</h2>{availablePaymentOptions.map((option) => <label className={paymentMethod === option.value ? "payment-option selected" : "payment-option"} key={option.value}><input type="radio" name="paymentMethod" value={option.value} checked={paymentMethod === option.value} onChange={(event) => setPaymentMethod(event.target.value)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}<button className="button" disabled={submitting || Boolean(message.includes("placed successfully"))} type="submit">{submitting ? (paymentMethod === "cash_store" ? "Placing order..." : "Opening payment...") : paymentMethod === "cash_store" ? "Confirm cash order" : `Pay now ₹${total}`} <span>→</span></button>{message && <p className="admin-message" role="status">{message}</p>}</form></section><aside className="checkout-summary"><p className="eyebrow">ORDER SUMMARY</p><div><span>Subtotal</span><strong>₹{subtotal}</strong></div><div><span>Delivery</span><strong>{homeDelivery ? `₹${deliveryCharge}` : "Free"}</strong></div><div className="checkout-total"><span>Total</span><strong>₹{total}</strong></div></aside></div></main></>;
}
