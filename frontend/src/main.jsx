import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import "./responsive.css";
import AdminPage from "./AdminPage";
import ProductPage from "./ProductPage";
import StoryPage from "./StoryPage";
import AuthPage from "./AuthPage";
import ProfilePage from "./ProfilePage";
import Navbar from "./Navbar";
import CheckoutPage from "./CheckoutPage";
import { useToast } from "./Toast";

function Storefront() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("search") || "");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [homepage, setHomepage] = useState(null);
  const [contact, setContact] = useState(null);
  const toast = useToast();
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    fetch(`${apiUrl}/api/products`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load products");
        return response.json();
      })
      .then(setProducts)
      .catch((loadError) => { setError(loadError.message); toast(loadError.message, "error"); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ""}/api/settings/contact`)
      .then((response) => response.ok ? response.json() : null)
      .then(setContact)
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ""}/api/settings/homepage`)
      .then((response) => response.ok ? response.json() : null)
      .then(setHomepage)
      .catch(() => {});
  }, []);
  const shown = useMemo(() => products.filter((p) => { const searchText = `${p.name} ${p.type} ${p.description || ""}`.toLowerCase(); return (category === "All" || p.type === category) && searchText.includes(query.toLowerCase().trim()); }), [products, category, query]);
  const add = (product, event) => {
    event.stopPropagation();
    if (cart.some((item) => item.id === product.id)) { toast("This product is already in your bag.", "error"); return; }
    setCart((items) => [...items, product]);
    toast("Added to your bag.");
  };

  return (
    <>
      <Navbar cartCount={cart.length} onBagClick={() => localStorage.getItem("verdant_token") ? setCartOpen(true) : (window.location.href = "/login?next=/")} query={query} setQuery={setQuery} />

      <main>
        {!query.trim() && <section className="hero">
          <div className="hero-copy"><p className="eyebrow">{homepage?.eyebrow || "✦ THOUGHTFULLY MADE"}</p><h1>{homepage?.title || "Good things for a slower life."}</h1><p className="intro">{homepage?.intro || "Intentional objects, everyday essentials, and small rituals designed to bring more ease to your day."}</p><a className="button" href="#shop">Explore the collection <span>→</span></a></div>
          <div className="hero-image"><img src={homepage?.image || "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=1200&q=90"} alt="Homepage hero" /><span>{homepage?.imageLabel || "THE AUTUMN EDIT · 2026"}</span></div>
        </section>}

        <section className="collection" id="shop"><div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Made to be lived in</h2></div><div className="filters">{["All", "Apparel", "Accessories", "Home"].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div></div>{loading ? <p>Loading the collection...</p> : error ? <p role="alert">{error}</p> : shown.length === 0 ? <p className="empty-search">No products match “{query}”.</p> : <div className="products">{shown.map((product) => <article className="product" key={product.id} onClick={() => { window.location.href = `/product/${product.id}`; }}><div className="product-image"><img src={product.image} alt={product.name} /><button onClick={(event) => add(product, event)}>Add to bag</button></div><div className="product-meta"><div><h3>{product.name}</h3><p>{product.type} · Oat</p></div><strong>₹{product.price}</strong></div>{product.rating?.count > 0 && <small>★★★★★ <em>{product.rating.average} ({product.rating.count})</em></small>}</article>)}</div>}</section>
        <section className="story" id="story"><p className="eyebrow">OUR PHILOSOPHY</p><h2>Less, but better. Always.</h2><p>We believe the things around you should feel good, work hard, and last a long time. No noise. Just considered design.</p></section>
      </main>
      <footer id="journal"><div><a className="logo" href="#">verdant<span>.</span></a><p>Objects for everyday living.</p><div className="footer-contact"><a href={`tel:${contact?.phone || "+919876543210"}`}>{contact?.phone || "+91 98765 43210"}</a><a href={`mailto:${contact?.email || "hello@verdantgoods.com"}`}>{contact?.email || "hello@verdantgoods.com"}</a><span>{contact?.address || "12 Garden Lane, Kolkata"}</span><span>{contact?.hours || "Mon-Sat, 10:00 AM-7:00 PM"}</span></div><div className="social-links"><a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3.3 0-5 1.9-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.7.3-1 1-1Z" /></svg><span>Facebook</span></a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" className="social-dot" /></svg><span>Instagram</span></a></div></div><small>© 2026 Verdant Goods. Made with intention.</small></footer>

      {cartOpen && <div className="overlay" onClick={() => setCartOpen(false)} />}
      <aside className={cartOpen ? "cart open" : "cart"}><div className="cart-title"><h2>Your bag <small>({cart.length})</small></h2><button onClick={() => setCartOpen(false)}>×</button></div>{cart.length === 0 ? <div className="empty">Your bag is empty.<br /><small>Find something you love.</small></div> : <>{cart.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div><strong>{item.name}</strong><p>₹{item.price}</p></div><button onClick={() => setCart(cart.filter((cartItem) => cartItem.id !== item.id))}>×</button></div>)}<div className="subtotal"><span>Subtotal</span><strong>₹{cart.reduce((sum, item) => sum + item.price, 0)}</strong></div><button className="checkout" onClick={() => { sessionStorage.setItem("verdant_checkout", JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: 1 })), address: "" })); window.location.href = "/checkout"; }}>Checkout →</button></>}</aside>
    </>
  );
}

export default function App() {
  if (window.location.pathname === "/login") return <AuthPage />;
  if (window.location.pathname === "/profile") return localStorage.getItem("verdant_token") ? <ProfilePage /> : <AuthPage />;
  if (window.location.pathname === "/checkout") return localStorage.getItem("verdant_token") ? <CheckoutPage /> : <AuthPage />;
  const productMatch = window.location.pathname.match(/^\/product\/(\d+)$/);
  if (productMatch) return localStorage.getItem("verdant_token") ? <ProductPage productId={Number(productMatch[1])} /> : <AuthPage />;
  if (window.location.pathname === "/story") return <StoryPage />;
  return window.location.pathname === "/admin" ? <AdminPage /> : <Storefront />;
}
