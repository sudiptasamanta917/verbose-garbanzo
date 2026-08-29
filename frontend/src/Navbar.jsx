import { useEffect, useState } from "react";

export default function Navbar({ cartCount = 0, onBagClick, query = "", setQuery }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState({ announcementEnabled: true, announcementText: "FREE SHIPPING ON ORDERS OVER $100" });
  const [searchInput, setSearchInput] = useState(query);
  const hasToken = Boolean(localStorage.getItem("verdant_token"));

  useEffect(() => {
    const token = localStorage.getItem("verdant_token");
    if (!token) return;
    const apiUrl = import.meta.env.VITE_API_URL || "";
    fetch(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((user) => setIsAdmin(user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => setSearchInput(query), [query]);

  const search = (value) => {
    setSearchInput(value);
    if (setQuery) setQuery(value);
    else window.location.href = `/?search=${encodeURIComponent(value)}#shop`;
  };

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    fetch(`${apiUrl}/api/settings/store`).then((response) => response.ok ? response.json() : null).then((settings) => settings && setAnnouncement(settings)).catch(() => {});
  }, []);

  const openBag = () => {
    if (onBagClick) {
      onBagClick();
      return;
    }
    window.location.href = hasToken ? "/profile" : "/login?next=/";
  };

  return <>
    {announcement.announcementEnabled && <div className="announcement">{announcement.announcementText}</div>}
    <header className="header">
      <button className="menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">☰</button>
      <a className="logo" href="/">verdant<span>.</span></a>
      <nav className={menuOpen ? "nav open" : "nav"}>
        <a href="/#shop">Shop</a>
        <a href="/story">Our story</a>
        {isAdmin && <a href="/admin">Admin</a>}
      </nav>
      <div className="header-actions">
        <label className="search">⌕ <input value={searchInput} onChange={(event) => search(event.target.value)} placeholder="Search" aria-label="Search products" /></label>
        <button className="bag" onClick={openBag}>Bag <b>{cartCount}</b></button>
        {hasToken && <button className="profile-button" onClick={() => { window.location.href = "/profile"; }} aria-label="Open your profile" title="Profile"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.5-3.4 2.7-5.25 6.5-5.25s6 1.85 6.5 5.25" /></svg></button>}
      </div>
    </header>
  </>;
}
