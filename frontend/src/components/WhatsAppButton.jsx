export default function WhatsAppButton() {
  const phoneNumber = import.meta.env.VITE_WHATSAPP_NUMBER;

  const message = import.meta.env.VITE_WHATSAPP_MESSAGE;

  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
    message
  )}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Verdant Store on WhatsApp"
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 999999,

        width: "58px",
        height: "58px",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        backgroundColor: "#25D366",
        color: "#ffffff",

        borderRadius: "50%",
        textDecoration: "none",

        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",

        transition: "transform 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width="34"
        height="34"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.55 1.73 6.53L3 29l6.68-1.7A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.8c-2.04 0-4.04-.55-5.78-1.6l-.42-.25-3.96 1.01 1.03-3.86-.27-.43A10.74 10.74 0 1 1 16 26.8zm5.9-8.04c-.32-.16-1.88-.93-2.17-1.04-.29-.11-.5-.16-.71.16-.21.31-.81 1.04-.99 1.25-.18.21-.36.23-.68.08-.32-.16-1.33-.49-2.54-1.57-.94-.84-1.57-1.88-1.75-2.2-.18-.31-.02-.48.14-.64.14-.14.32-.36.47-.54.16-.18.21-.31.32-.52.11-.21.05-.39-.03-.55-.08-.16-.71-1.72-.97-2.36-.26-.63-.52-.55-.71-.56h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.08-1.1 2.64s1.13 3.06 1.29 3.27c.16.21 2.22 3.39 5.37 4.75.75.32 1.33.51 1.79.65.75.24 1.43.2 1.97.12.6-.09 1.88-.77 2.14-1.51.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.6-.37z" />
      </svg>
    </a>
  );
}