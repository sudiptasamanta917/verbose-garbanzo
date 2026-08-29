import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import { useToast } from "./Toast";

const apiUrl = import.meta.env.VITE_API_URL || "";

export default function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [profile, setProfile] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const toast = useToast();

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("verdant_token")}` };
    Promise.all([fetch(`${apiUrl}/api/products/${productId}`, { headers }), fetch(`${apiUrl}/api/auth/me`, { headers }), fetch(`${apiUrl}/api/products/${productId}/reviews`, { headers })])
      .then(async ([productResponse, profileResponse, reviewsResponse]) => {
        if (!productResponse.ok) throw new Error("Product not found");
        if (!profileResponse.ok) throw new Error("Unable to load your profile");
        const profileData = await profileResponse.json();
        const productData = await productResponse.json();
        setProduct(productData);
        setSelectedImage(productData.image);
        setProfile(profileData);
        setAddress(profileData.address || "");
        if (reviewsResponse.ok) { const reviewData = await reviewsResponse.json(); setReviews(reviewData.reviews || []); setCanReview(reviewData.canReview); }
      })
      .catch((error) => { setMessage(error.message); toast(error.message, "error"); });
  }, [productId]);

  const continueToCheckout = (event) => {
    event.preventDefault();
    sessionStorage.setItem("verdant_checkout", JSON.stringify({ productId, quantity, address }));
    window.location.href = "/checkout";
  };

  const submitReview = async (event) => {
    event.preventDefault();
    const response = await fetch(`${apiUrl}/api/products/${productId}/reviews`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("verdant_token")}` }, body: JSON.stringify({ rating: reviewRating, text: reviewText }) });
    const data = await response.json();
    if (!response.ok) { toast(data.error || "Unable to submit review.", "error"); return; }
    setReviews((current) => [{ ...data, name: profile.name || profile.email }, ...current]); setCanReview(false); setReviewText(""); toast("Your review was submitted.");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setMessage("Current location is not available in this browser."); toast("Current location is unavailable.", "error"); return; }
    setLocating(true);
    setMessage("");
    let bestAccuracy = Infinity;
    let bestPosition;
    let timeoutId;
    const finish = async ({ coords }) => {
      try {
        const response = await fetch(`${apiUrl}/api/location/reverse?lat=${encodeURIComponent(coords.latitude)}&lng=${encodeURIComponent(coords.longitude)}`, { headers: { Authorization: `Bearer ${localStorage.getItem("verdant_token")}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to find an address for your location.");
        if (!result.address) throw new Error("No readable address was found for your location.");
        setAddress(result.address);
      } catch (error) {
        setMessage(error.message); toast(error.message, "error");
      } finally {
        clearTimeout(timeoutId);
        setLocating(false);
      }
    };
    const watchId = navigator.geolocation.watchPosition((position) => {
      if (position.coords.accuracy >= bestAccuracy) return;
      bestAccuracy = position.coords.accuracy;
      bestPosition = position;
      if (bestAccuracy <= 25) {
        navigator.geolocation.clearWatch(watchId);
        finish(position);
      }
    }, () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timeoutId);
      setMessage("Unable to fetch your current location. Check that location access is enabled."); toast("Unable to fetch your current location.", "error");
      setLocating(false);
    }, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
    timeoutId = setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      if (bestPosition) finish(bestPosition);
      else {
        setMessage("Unable to get your device location. Please enable location access or enter the address manually."); toast("Unable to get your device location.", "error");
        setLocating(false);
      }
    }, 8000);
  };

  if (!product) return <><Navbar /><main className="detail-page"><a href="/">← Back to store</a><p>{message || "Loading product..."}</p></main></>;
  const description = product.description || "A thoughtfully made essential designed to bring more ease and intention to everyday living.";
  const gallery = [product.image, ...(product.images || [])].filter((image, index, images) => image && images.indexOf(image) === index);
  const ratingValue = product.rating?.average || 0;
  const filledStars = Math.round(ratingValue);
  return <><Navbar /><main className="detail-page"><a className="back-link" href="/">← Back to collection</a><div className="detail-grid"><div><div className="detail-image"><img src={selectedImage || gallery[0]} alt={product.name} /></div>{gallery.length > 1 && <div className="detail-gallery">{gallery.map((image) => <button type="button" className={selectedImage === image ? "selected" : ""} key={image} onClick={() => setSelectedImage(image)}><img src={image} alt={`${product.name} view`} /></button>)}</div>}</div><div className="detail-copy"><p className="eyebrow">{product.type}</p><h1>{product.name}</h1><strong className="detail-price">₹{product.price}</strong><p className="detail-description">{description}</p><div className="detail-specs"><span>{product.stockStatus || "In stock"}</span><span>Everyday essential</span></div><h2>Order this product</h2><p className="order-customer">Ordering as <strong>{profile?.name || "your profile"}</strong> ({profile?.email})</p><form className="order-form" onSubmit={continueToCheckout}><div className="quantity-control"><span>Quantity</span><div><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity">−</button><output>{quantity}</output><button type="button" onClick={() => setQuantity(quantity + 1)} aria-label="Increase quantity">+</button></div></div><label className="location-field">Delivery location<input maxLength="250" placeholder="Enter delivery address" value={address} onChange={(event) => setAddress(event.target.value)} /><span><button type="button" onClick={() => setAddress(profile?.address || "")} disabled={!profile?.address}>Use saved address</button><button type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Locating..." : "Use current location"}</button></span></label><button className="button" type="submit">Continue to checkout <span>→</span></button></form>{message && <p className="admin-message" role="status">{message}</p>}<section className="product-reviews"><p className="eyebrow">CUSTOMER REVIEWS</p><div className="rating-summary"><span className="rating-stars" aria-label={`${ratingValue} out of 5 stars`}>{[0, 1, 2, 3, 4].map((star) => <span key={star}>{star < filledStars ? "★" : "☆"}</span>)}</span><strong>{product.rating?.count ? `${product.rating.average} out of 5` : "No ratings yet"}</strong>{product.rating?.count > 0 && <small>({product.rating.count} {product.rating.count === 1 ? "review" : "reviews"})</small>}</div>{reviews.map((review) => <article className="review" key={`${review.name}-${review.createdAt}`}><strong>{"★".repeat(review.rating)}</strong><p>{review.text}</p><small>{review.name}</small></article>)}{canReview && <form className="review-form" onSubmit={submitReview}><h3>Share your experience</h3><label>Rating<select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label><textarea required maxLength="500" placeholder="Write your review" value={reviewText} onChange={(event) => setReviewText(event.target.value)} /><button className="button" type="submit">Submit review <span>→</span></button></form>}</section></div></div></main></>;
}
