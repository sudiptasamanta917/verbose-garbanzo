import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useToast } from "./Toast";

const apiUrl = import.meta.env.VITE_API_URL || "";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("verdant_token")}` });

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const toast = useToast();
  const ordersPerPage = 10;

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/auth/me`, { headers: authHeaders() }),
      fetch(`${apiUrl}/api/orders`, { headers: authHeaders() }),
    ]).then(async ([profileResponse, ordersResponse]) => {
      if (profileResponse.status === 401 || ordersResponse.status === 401) {
        window.location.href = "/login?next=/profile";
        return;
      }
      if (!profileResponse.ok || !ordersResponse.ok) throw new Error("Unable to load your account");
      const profileData = await profileResponse.json();
      setProfile(profileData);
      setName(profileData.name || "");
      setMobile(profileData.mobile || "");
      setAddress(profileData.address || "");
      setOrders(await ordersResponse.json());
    }).catch((error) => { setMessage(error.message); toast(error.message, "error"); });
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, address, mobile }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error || "Unable to save your profile"); toast(data.error || "Unable to save your profile", "error");
      return;
    }
    setProfile(data);
    setName(data.name || "");
    setMobile(data.mobile || "");
    setAddress(data.address || "");
    setMessage("Profile saved."); toast("Profile saved.");
  };

  const signOut = () => {
    localStorage.removeItem("verdant_token");
    window.location.href = "/";
  };

  const pageCount = Math.max(1, Math.ceil(orders.length / ordersPerPage));
  const visibleOrders = orders.slice((orderPage - 1) * ordersPerPage, orderPage * ordersPerPage);
  const formatDateTime = (value, fallback = "Not available") => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : fallback;

  if (!profile) return <><Navbar /><main className="profile-page"><p>{message || "Loading your account..."}</p></main></>;
  return <div className="profile-page">
    <Navbar />
    <main className="profile-main">
      <div className="profile-intro"><div><p className="eyebrow">YOUR ACCOUNT</p><h1>Welcome back{profile.name ? `, ${profile.name}` : "."}</h1><p className="profile-lead">Manage your details and keep track of every Verdant order.</p></div><button className="profile-sign-out" onClick={signOut}>Log out</button></div>
      {message && <p className="admin-message" role="status">{message}</p>}
      <section className="profile-section"><div className="profile-section-heading"><p className="eyebrow">PROFILE DETAILS</p><h2>How should we know you?</h2></div><form className="profile-form" onSubmit={saveProfile}><label>Name<input value={name} maxLength="100" placeholder="Your name" onChange={(event) => setName(event.target.value)} /></label><label>Email<input value={profile.email} readOnly /></label><label>Mobile number<input required minLength="8" type="tel" value={mobile} placeholder="Your mobile number" onChange={(event) => { if (event.target.value.trim()) setMobile(event.target.value); }} /></label><label className="profile-address">Saved delivery address<input value={address} maxLength="250" placeholder="Your delivery address" onChange={(event) => setAddress(event.target.value)} /></label><button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"} <span>→</span></button></form></section>
      <section className="profile-section profile-orders-section"><div className="profile-section-heading"><p className="eyebrow">YOUR ORDERS</p><h2>Order history <small>({orders.length})</small></h2><p className="profile-section-copy">A clear record of your purchases, payment status, and collection progress.</p></div>{orders.length === 0 ? <p className="profile-empty">No orders from this account yet.</p> : <><div className="profile-orders">{visibleOrders.map((order) => { const paymentStatus = order.paymentStatus || (order.paymentMethod?.startsWith("online") ? "Paid" : "Pending"); return <article className="profile-order" key={order.id}><div className="order-main"><strong>{order.id}</strong><small>Placed {formatDateTime(order.createdAt, "Date not available")}</small></div><div className="order-product"><strong>{order.items}</strong><small>{order.customer}</small></div><div className="order-payment"><span className={`payment-status ${paymentStatus.toLowerCase()}`}>{paymentStatus}</span><small>{paymentStatus === "Paid" ? `Paid ${formatDateTime(order.paymentDate || order.createdAt)}` : "Payment due at collection"}</small></div><div className="order-total"><strong>₹{order.total}</strong><em className={`order-status ${order.status.toLowerCase()}`}>{order.status}</em></div></article>; })}</div>{pageCount > 1 && <nav className="orders-pagination" aria-label="Order history pages"><button type="button" disabled={orderPage === 1} onClick={() => setOrderPage(orderPage - 1)}>Previous</button><span>Page {orderPage} of {pageCount}</span><button type="button" disabled={orderPage === pageCount} onClick={() => setOrderPage(orderPage + 1)}>Next</button></nav>}</>}</section>
    </main>
  </div>;
}
