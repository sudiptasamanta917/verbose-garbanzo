import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useToast } from "./Toast";

const apiUrl = import.meta.env.VITE_API_URL || "";
const statuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const paymentStatuses = ["Pending", "Paid", "Failed", "Refunded"];
const stockStatuses = ["In stock", "Low stock", "Out of stock"];
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("verdant_token")}` });

export default function AdminPage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ name: "", type: "Apparel", price: "", image: "", images: "", stockStatus: "In stock", description: "" });
  const [editingProduct, setEditingProduct] = useState(null);
  const [homepage, setHomepage] = useState({ eyebrow: "", title: "", intro: "", image: "", imageLabel: "" });
  const [storeSettings, setStoreSettings] = useState({ homeDeliveryEnabled: true, announcementEnabled: true, announcementText: "" });
  const [contact, setContact] = useState({ heading: "", phone: "", email: "", address: "", hours: "" });
  const [message, setMessage] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const toast = useToast();

  const load = async () => {
    const identity = await fetch(`${apiUrl}/api/auth/me`, { headers: authHeaders() });
    if (!identity.ok || (await identity.json()).role !== "admin") { window.location.href = "/login?next=/admin"; return; }
    const [productResponse, orderResponse, homepageResponse, storeResponse, contactResponse] = await Promise.all([
      fetch(`${apiUrl}/api/products`, { headers: { Authorization: `Bearer ${localStorage.getItem("verdant_token")}` } }),
      fetch(`${apiUrl}/api/orders`, { headers: { Authorization: `Bearer ${localStorage.getItem("verdant_token")}` } }),
      fetch(`${apiUrl}/api/settings/homepage`),
      fetch(`${apiUrl}/api/settings/store`),
      fetch(`${apiUrl}/api/settings/contact`),
    ]);
    if (productResponse.status === 401 || orderResponse.status === 401) { window.location.href = "/login?next=/admin"; return; }
    if (!productResponse.ok || !orderResponse.ok) throw new Error("Unable to load admin data");
    setProducts(await productResponse.json());
    setOrders(await orderResponse.json());
    if (homepageResponse.ok) setHomepage(await homepageResponse.json());
    if (storeResponse.ok) setStoreSettings(await storeResponse.json());
    if (contactResponse.ok) setContact(await contactResponse.json());
    setAuthorized(true);
  };

  const saveHomepage = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/settings/homepage`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(homepage) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to update homepage."); toast(data.error || "Unable to update homepage.", "error"); return; }
    setHomepage(data); setMessage("Homepage updated."); toast("Homepage updated.");
  };

  const updateStoreSettings = async (event) => {
    const homeDeliveryEnabled = event.target.checked;
    setStoreSettings((current) => ({ ...current, homeDeliveryEnabled }));
    const response = await fetch(`${apiUrl}/api/settings/store`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ homeDeliveryEnabled }) });
    if (!response.ok) { setMessage("Unable to update delivery setting."); toast("Unable to update delivery setting.", "error"); return; }
    toast(homeDeliveryEnabled ? "Home delivery enabled." : "Home delivery disabled.");
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/settings/store`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(storeSettings) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to update announcement."); toast(data.error || "Unable to update announcement.", "error"); return; }
    setStoreSettings(data); setMessage("Announcement updated."); toast("Announcement updated.");
  };

  const saveContact = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/settings/contact`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(contact) });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to update contact details."); toast(data.error || "Unable to update contact details.", "error"); return; }
    setContact(data); setMessage("Contact details updated."); toast("Contact details updated.");
  };

  useEffect(() => {
    load().catch((error) => { setMessage(error.message); toast(error.message, "error"); });
  }, []);

  const addProduct = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...form, images: form.images.split("\n").map((image) => image.trim()).filter(Boolean) }),
    });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error);
      toast(data.error, "error");
      return;
    }
    const product = await response.json();
    product.images = product.images || [];
    setProducts((current) => [...current, product]);
    setForm({ name: "", type: "Apparel", price: "", image: "", images: "", stockStatus: "In stock", description: "" });
    setMessage("Product added.");
    toast("Product added.");
  };

  const updateProduct = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/products/${editingProduct.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ...editingProduct, images: editingProduct.imagesText.split("\n").map((image) => image.trim()).filter(Boolean) }),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to update product."); toast(data.error || "Unable to update product.", "error"); return; }
    setProducts((current) => current.map((product) => product.id === data.id ? data : product));
    setEditingProduct(null);
    setMessage("Product updated.");
    toast("Product updated.");
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Delete this product? This action cannot be undone.")) return;
    const response = await fetch(`${apiUrl}/api/products/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) {
      setMessage("Unable to delete product.");
      toast("Unable to delete product.", "error");
      return;
    }
    setProducts((current) => current.filter((product) => product.id !== id));
    toast("Product deleted.");
  };

  const updateOrder = async (id, field, value) => {
    const response = await fetch(`${apiUrl}/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      setMessage("Unable to update order.");
      toast("Unable to update order.", "error");
      return;
    }
    const updated = await response.json();
    setOrders((current) => current.map((order) => order.id === id ? updated : order));
    toast("Order status updated.");
  };

  if (!authorized) return <><Navbar /><main className="auth-page"><p>Checking admin access...</p></main></>;
  return <div className="admin-shell">
    <Navbar />
    <main className="admin-main">
      <div className="admin-intro"><p className="eyebrow">STORE MANAGEMENT</p><h1>Good things, <i>well managed.</i></h1><p>Manage your collection and keep every order moving.</p></div>
      {message && <p className="admin-message" role="status">{message}</p>}
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">HOMEPAGE</p><h2>Edit hero section</h2></div></div><form className="homepage-form" onSubmit={saveHomepage}><input required placeholder="Eyebrow text" value={homepage.eyebrow} onChange={(event) => setHomepage({ ...homepage, eyebrow: event.target.value })} /><input required placeholder="Hero heading" value={homepage.title} onChange={(event) => setHomepage({ ...homepage, title: event.target.value })} /><textarea required placeholder="Hero description" value={homepage.intro} onChange={(event) => setHomepage({ ...homepage, intro: event.target.value })} /><input required type="url" placeholder="Hero image URL" value={homepage.image} onChange={(event) => setHomepage({ ...homepage, image: event.target.value })} /><input required placeholder="Image label" value={homepage.imageLabel} onChange={(event) => setHomepage({ ...homepage, imageLabel: event.target.value })} /><button className="admin-button" type="submit">Save homepage</button></form></section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">STORE SETTINGS</p><h2>Store options</h2></div></div><label className="setting-toggle"><input type="checkbox" checked={storeSettings.homeDeliveryEnabled} onChange={updateStoreSettings} /><span><strong>Pay now and get home delivery</strong><small>Show or hide home delivery at checkout.</small></span></label><form className="announcement-form" onSubmit={saveAnnouncement}><label className="setting-toggle"><input type="checkbox" checked={storeSettings.announcementEnabled} onChange={(event) => setStoreSettings({ ...storeSettings, announcementEnabled: event.target.checked })} /><span><strong>Show announcement bar</strong><small>Show or hide the top message across the store.</small></span></label><input required maxLength="120" placeholder="Announcement text" value={storeSettings.announcementText} onChange={(event) => setStoreSettings({ ...storeSettings, announcementText: event.target.value })} /><button className="admin-button" type="submit">Save announcement</button></form></section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">STORY PAGE</p><h2>Store contact</h2></div></div><form className="contact-form" onSubmit={saveContact}><input required placeholder="Contact heading" value={contact.heading} onChange={(event) => setContact({ ...contact, heading: event.target.value })} /><input required type="tel" placeholder="Phone number" value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /><input required type="email" placeholder="Email address" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /><input required placeholder="Store address" value={contact.address} onChange={(event) => setContact({ ...contact, address: event.target.value })} /><input required placeholder="Opening hours" value={contact.hours} onChange={(event) => setContact({ ...contact, hours: event.target.value })} /><button className="admin-button" type="submit">Save contact details</button></form></section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">INVENTORY</p><h2>Add a product</h2></div></div><form className="product-form" onSubmit={addProduct}><input required placeholder="Product name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>Apparel</option><option>Accessories</option><option>Home</option></select><input required min="0" step="0.01" type="number" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /><select value={form.stockStatus} onChange={(event) => setForm({ ...form, stockStatus: event.target.value })}>{stockStatuses.map((status) => <option key={status}>{status}</option>)}</select><input required type="url" placeholder="Primary image URL" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /><textarea placeholder="Additional image URLs, one per line" value={form.images} onChange={(event) => setForm({ ...form, images: event.target.value })} /><textarea placeholder="Product description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><button className="admin-button" type="submit">Add product</button></form></section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">INVENTORY</p><h2>Current products <small>({products.length})</small></h2></div></div><div className="admin-table">{products.map((product) => editingProduct?.id === product.id ? <form className="product-editor" key={product.id} onSubmit={updateProduct}><div className="product-editor-heading"><strong>Edit {product.name}</strong><button type="button" className="delete-button" onClick={() => setEditingProduct(null)}>Cancel</button></div><input required placeholder="Product name" value={editingProduct.name} onChange={(event) => setEditingProduct({ ...editingProduct, name: event.target.value })} /><select value={editingProduct.type} onChange={(event) => setEditingProduct({ ...editingProduct, type: event.target.value })}><option>Apparel</option><option>Accessories</option><option>Home</option></select><input required min="0" step="0.01" type="number" placeholder="Price" value={editingProduct.price} onChange={(event) => setEditingProduct({ ...editingProduct, price: event.target.value })} /><select value={editingProduct.stockStatus || "In stock"} onChange={(event) => setEditingProduct({ ...editingProduct, stockStatus: event.target.value })}>{stockStatuses.map((status) => <option key={status}>{status}</option>)}</select><input required type="url" placeholder="Primary image URL" value={editingProduct.image} onChange={(event) => setEditingProduct({ ...editingProduct, image: event.target.value })} /><textarea placeholder="Additional image URLs, one per line" value={editingProduct.imagesText} onChange={(event) => setEditingProduct({ ...editingProduct, imagesText: event.target.value })} /><textarea placeholder="Product description" value={editingProduct.description || ""} onChange={(event) => setEditingProduct({ ...editingProduct, description: event.target.value })} /><div><button className="admin-button" type="submit">Save product</button></div></form> : <div className="admin-row" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><small>{product.type} · {product.stockStatus || "In stock"}</small></div><span>₹{product.price}</span><button className="edit-button" onClick={() => setEditingProduct({ ...product, stockStatus: product.stockStatus || "In stock", imagesText: (product.images || []).join("\n") })}>Edit</button><button className="delete-button" onClick={() => deleteProduct(product.id)}>Delete</button></div>)}</div></section>
      <section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">FULFILLMENT</p><h2>Orders <small>({orders.length})</small></h2></div></div><div className="admin-table orders-table">{orders.map((order) => <div className="admin-row order-row" key={order.id}><div><strong>{order.id}</strong><small>{order.customer}</small><small>{order.email} · {order.mobile || "Phone not provided"}</small></div><div><strong>{order.items}</strong><small>{order.createdAt}</small></div><span>₹{order.total}</span><div className="order-controls"><label>Order status<select value={order.status} onChange={(event) => updateOrder(order.id, "status", event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Payment status<select value={order.paymentStatus || (order.paymentMethod?.startsWith("online") ? "Paid" : "Pending")} onChange={(event) => updateOrder(order.id, "paymentStatus", event.target.value)}>{paymentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div></div>)}</div></section>
    </main>
  </div>;
}
