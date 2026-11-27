import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProducts } from "../hooks/useProducts";
import { useToast } from "../hooks/useToast";
import {
  MAX_FILES_PER_UPLOAD,
  deleteProductImages,
  isManagedImageUrl,
  isStorageConfigured,
  saveProductImages,
  shrinkImage,
  uploadProductImages,
  validateImageFile,
} from "../services/storage";
import {
  createOffer,
  deleteOffer,
  fetchAdminActivity,
  fetchAllOffers,
  updateOffer,
} from "../services/offers";
import {
  fetchAllOrders,
  updateOrderStatus,
  updateOrderNotes,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  formatPhone,
  summarizeItems,
} from "../services/orders";
import { adminLogin, adminLogout, adminSession, admin2faSetup, admin2faEnable, admin2faVerify, admin2faRecovery } from "../services/auth";
import QRCode from "qrcode";
import "./AdminImages.css";

const ACTOR_STORAGE_KEY = "mnx-admin-actor";

export default function AdminImages() {
  const { products, loading, applyImageUpdate } = useProducts();
  const { showToast } = useToast();

  // ---------- Auth state ----------
  const [authState, setAuthState] = useState({
    status: "checking", // 'checking' | 'unauthenticated' | 'authenticated' | 'mfa_required' | '2fa_setup'
    user: null,
    error: "",
    totp_secret: "",
    recovery_codes: [],
  });

  const [actor, setActor] = useState(() => sessionStorage.getItem(ACTOR_STORAGE_KEY) || "");
  const [actorInput, setActorInput] = useState("");
  const [tab, setTab] = useState("photos"); // 'photos' | 'offers' | 'orders'

  // ---------- Auth actions ----------
  const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;
    if (!email || !password) {
      setAuthState((prev) => ({ ...prev, error: "Email and password are required." }));
      return;
    }
    setAuthState((prev) => ({ ...prev, error: "" }));

    const result = await adminLogin(email, password);
    if (result.ok) {
      if (result.user?.totp_enabled === false) {
        // New account — mandatory 2FA setup before dashboard access
        setAuthState((prev) => ({
          ...prev,
          status: "2fa_setup",
          user: result.user,
          error: "",
        }));
      } else if (result.mfa_required) {
        setAuthState({ status: "mfa_required", user: result.user, error: "" });
      } else {
        setAuthState({ status: "authenticated", user: result.user, error: "" });
      }
    } else {
      setAuthState((prev) => ({ ...prev, error: result.error || "Invalid credentials." }));
    }
  };

  const handle2FAVerify = async (e) => {
    e.preventDefault();
    const code = document.getElementById("admin-2fa-code").value;
    if (!code) {
      setAuthState((prev) => ({ ...prev, error: "Enter the verification code." }));
      return;
    }

    const result = await admin2faVerify(code);
    if (result.ok) {
      setAuthState({ status: "authenticated", user: authState.user, error: "" });
    } else {
      setAuthState((prev) => ({ ...prev, error: result.error || "Invalid code." }));
    }
  };

  const handle2FARecovery = async (e) => {
    e.preventDefault();
    const code = document.getElementById("admin-recovery-code").value;
    if (!code) {
      setAuthState((prev) => ({ ...prev, error: "Enter the recovery code." }));
      return;
    }

    const result = await admin2faRecovery(code);
    if (result.ok) {
      setAuthState({ status: "authenticated", user: authState.user, error: "" });
    } else {
      setAuthState((prev) => ({ ...prev, error: result.error || "Invalid recovery code." }));
    }
  };

  const handle2FASetup = async () => {
    const result = await admin2faSetup();
    if (result.ok) {
      setAuthState((prev) => ({
        ...prev,
        totp_secret: result.secret,
        recovery_codes: result.recovery_codes,
        error: "",
      }));
    } else {
      setAuthState((prev) => ({ ...prev, error: result.error || "Failed to setup 2FA." }));
    }
  };

  const handle2FAEnable = async (e) => {
    e.preventDefault();
    const code = document.getElementById("admin-2fa-setup-code").value;
    if (!code) {
      setAuthState((prev) => ({ ...prev, error: "Enter the verification code." }));
      return;
    }
    const result = await admin2faEnable(code);
    if (result.ok) {
      setAuthState({
        status: "authenticated",
        user: authState.user,
        error: "",
        totp_secret: "",
        recovery_codes: [],
      });
    } else {
      setAuthState((prev) => ({ ...prev, error: result.error || "Invalid code." }));
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setAuthState({ status: "unauthenticated", user: null, error: "" });
    setActor("");
    setActorInput("");
    setTab("photos");
    sessionStorage.removeItem(ACTOR_STORAGE_KEY);
  };

  const [qrDataUrl, setQrDataUrl] = useState("");

  // Generate QR code locally when secret becomes available
  useEffect(() => {
    if (!authState.totp_secret) return;
    const qrUrl = `otpauth://totp/MNX:${encodeURIComponent(authState.user?.email || "admin")}?secret=${authState.totp_secret}&issuer=MNX`;
    QRCode.toDataURL(qrUrl, { width: 300, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [authState.totp_secret, authState.user]);

  // Fetch 2FA setup data when entering 2fa_setup state
  useEffect(() => {
    if (authState.status === "2fa_setup" && !authState.totp_secret) {
      (async () => {
        const result = await admin2faSetup();
        if (result.ok) {
          setAuthState((prev) => ({
            ...prev,
            totp_secret: result.secret,
            recovery_codes: result.recovery_codes,
          }));
        } else {
          setAuthState((prev) => ({ ...prev, error: result.error || "Failed to setup 2FA." }));
        }
      })();
    }
  }, [authState.status, authState.totp_secret]);

  // Check session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await adminSession();
        if (!cancelled) {
          if (result.ok) {
            if (result.user?.totp_enabled === false) {
              setAuthState((prev) => ({ ...prev, status: "2fa_setup", user: result.user, error: "" }));
            } else if (result.mfa_required) {
              setAuthState({ status: "mfa_required", user: result.user, error: "" });
            } else {
              setAuthState({
                status: "authenticated",
                user: result.user,
                error: "",
              });
            }
          } else {
            setAuthState({ status: "unauthenticated", user: null, error: "" });
          }
        }
      } catch {
        if (!cancelled) {
          setAuthState({ status: "unauthenticated", user: null, error: "" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Photos state ----------
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState([]);
  const [savedUrls, setSavedUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [applyToGroup, setApplyToGroup] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [broken, setBroken] = useState(() => new Set());
  const [orphansCleaned, setOrphansCleaned] = useState(false);

  const fileInput = useRef(null);
  const dragDepth = useRef(0);

  const configured = isStorageConfigured();

  const selected = useMemo(
    () => products.find((p) => p.id === selectedId) || null,
    [products, selectedId]
  );

  const groupSiblings = useMemo(() => {
    if (!selected?.variant_group) return [];
    return products.filter(
      (p) => p.variant_group && p.variant_group === selected.variant_group
    );
  }, [products, selected]);

  const visibleProducts = useMemo(() => {
    const list = onlyMissing
      ? products.filter((p) => !(p.image_urls || []).length && !p.image_url)
      : products;
    return [...list].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  }, [products, onlyMissing]);

  const lock = () => {
    handleLogout();
  };

  // Prevent navigation away during drag
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const markBroken = (url) => setBroken((prev) => new Set(prev).add(url));

  const handleFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length || !selected) return;

    const problems = incoming.map(validateImageFile).filter(Boolean);
    if (problems.length) {
      setError(problems.join(" "));
      setNotice("");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const accepted = incoming.slice(0, MAX_FILES_PER_UPLOAD);
      const dropped = incoming.length - accepted.length;
      const prepared = [];
      for (const file of accepted) {
        try {
          prepared.push(await shrinkImage(file));
        } catch {
          prepared.push(file);
        }
      }

      const { urls, skipped } = await uploadProductImages({
        productId: selected.id,
        files: prepared,
        actor,
      });
      setDraft((prev) => [...prev, ...urls]);
      setNotice(
        [
          skipped.length
            ? `Uploaded ${urls.length}. Could not read: ${skipped.join(", ")}.`
            : `Uploaded ${urls.length} photo${urls.length === 1 ? "" : "s"}.`,
          dropped ? `Skipped ${dropped} beyond the ${MAX_FILES_PER_UPLOAD}-at-a-time limit.` : "",
          "Press Save to publish.",
        ]
          .filter(Boolean)
          .join(" ")
      );
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const move = (index, delta) => {
    setDraft((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (url) => setDraft((prev) => prev.filter((u) => u !== url));

  const targetIds = useMemo(() => {
    if (!selected) return [];
    if (applyToGroup && groupSiblings.length > 1) return groupSiblings.map((p) => p.id);
    return [selected.id];
  }, [selected, applyToGroup, groupSiblings]);

  const orphans = useMemo(
    () => savedUrls.filter((u) => !draft.includes(u) && isManagedImageUrl(u)),
    [savedUrls, draft]
  );

  const dirty = useMemo(
    () => draft.length !== savedUrls.length || draft.some((u, i) => u !== savedUrls[i]),
    [draft, savedUrls]
  );

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await saveProductImages({ productIds: targetIds, urls: draft, actor });
      applyImageUpdate(targetIds, draft);
      setSavedUrls(draft);
      setNotice(
        targetIds.length > 1
          ? `Saved across ${targetIds.length} variants.`
          : "Saved. The storefront now uses these photos."
      );
      showToast("Photos saved");
      refreshOffers();
    } catch (err) {
      setError(err.message || "Could not save the photos.");
    } finally {
      setBusy(false);
    }
  };

  const purgeOrphans = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteProductImages({ urls: orphans, actor });
      setNotice(`Deleted ${orphans.length} unused file${orphans.length === 1 ? "" : "s"}.`);
      setOrphansCleaned(true);
      refreshOffers();
    } catch (err) {
      setError(err.message || "Could not delete those files.");
    } finally {
      setBusy(false);
    }
  };

  const pendingOrphans = dirty || orphansCleaned ? [] : orphans;

  // ---------- Offers state ----------
  const [offers, setOffers] = useState([]);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState("");
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditUnavailable, setAuditUnavailable] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerDraft, setOfferDraft] = useState({
    productId: "",
    title: "",
    subtitle: "",
    kind: "x_for_price",
    config: {},
    active: true,
    startsAt: "",
    endsAt: "",
  });

  const refreshOffers = useCallback(async () => {
    try {
      const [list, activity] = await Promise.all([
        fetchAllOffers(""),
        fetchAdminActivity({ pin: "" }),
      ]);
      setOffers(list);
      setAuditEntries(activity.entries);
      setAuditUnavailable(activity.unavailable);
      setOffersError("");
    } catch (err) {
      setOffersError(err.message || "Could not load offers.");
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    if (authState.status === "authenticated" && tab === "offers") refreshOffers();
  }, [authState.status, tab, refreshOffers]);

  const productForOffer = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const resetOfferDraft = (offer = null) => {
    setOfferDraft(offer
      ? {
          productId: offer.product_id,
          title: offer.title || "",
          subtitle: offer.subtitle || "",
          kind: offer.kind,
          config: offer.config || {},
          active: offer.active,
          startsAt: offer.starts_at ? offer.starts_at.slice(0, 16) : "",
          endsAt: offer.ends_at ? offer.ends_at.slice(0, 16) : "",
        }
      : {
          productId: "",
          title: "",
          subtitle: "",
          kind: "x_for_price",
          config: {},
          active: true,
          startsAt: "",
          endsAt: "",
        });
    setEditingOffer(offer ? offer.id : null);
    setShowOfferForm(true);
  };

  const saveOffer = async () => {
    const { productId, title, subtitle, kind, config, active, startsAt, endsAt } = offerDraft;
    if (!productId || !title || !kind) {
      setOffersError("Product, title and type are required.");
      return;
    }
    setOffersBusy(true);
    setOffersError("");
    try {
      if (editingOffer) {
        await updateOffer({
          id: editingOffer,
          updates: { productId, title, subtitle, kind, config, active, startsAt, endsAt },
          pin: "",
        });
      } else {
        await createOffer({ productId, title, subtitle, kind, config, active, startsAt, endsAt, pin: "" });
      }
      setShowOfferForm(false);
      setOfferDraft({
        productId: "",
        title: "",
        subtitle: "",
        kind: "x_for_price",
        config: {},
        active: true,
        startsAt: "",
        endsAt: "",
      });
      setEditingOffer(null);
      await refreshOffers();
      showToast("Offer saved");
    } catch (err) {
      setOffersError(err.message || "Could not save the offer.");
    } finally {
      setOffersBusy(false);
    }
  };

  const removeOffer = async (id) => {
    if (!window.confirm("Delete this offer?")) return;
    setOffersBusy(true);
    setOffersError("");
    try {
      await deleteOffer({ id, pin: "" });
      await refreshOffers();
      showToast("Offer deleted");
    } catch (err) {
      setOffersError(err.message || "Could not delete the offer.");
    } finally {
      setOffersBusy(false);
    }
  };

  const toggleOffer = async (id, active) => {
    setOffersBusy(true);
    setOffersError("");
    try {
      await updateOffer({ id, updates: { active: !active }, pin: "" });
      await refreshOffers();
    } catch (err) {
      setOffersError(err.message || "Could not update offer.");
    } finally {
      setOffersBusy(false);
    }
  };

  const offerSummary = (o) => {
    const c = o.config || {};
    if (o.kind === "x_for_price") return `${Number(c.quantity) || 0} for $${(Number(c.price) || 0).toFixed(2)}`;
    if (o.kind === "bogo") return `Buy ${Number(c.buy) || 0} Get ${Number(c.get) || 0} Free`;
    if (o.kind === "percent_off_second") return `2nd item ${Number(c.percent) || 0}% off`;
    if (o.kind === "bulk_discount") return `Buy more than ${Number(c.minQuantity) || 0} for $${(Number(c.bulkPrice) || 0).toFixed(2)} each`;
    return o.kind;
  };

  // ---------- Orders state ----------
  const [orders, setOrders] = useState([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  const refreshOrders = useCallback(async () => {
    try {
      const list = await fetchAllOrders("");
      setOrders(list);
      setOrdersError("");
    } catch (err) {
      setOrdersError(err.message || "Could not load orders.");
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    if (authState.status === "authenticated" && tab === "orders") refreshOrders();
  }, [authState.status, tab, refreshOrders]);

  // ---------- Render ----------
  // Not authenticated yet - show login
  if (authState.status === "unauthenticated") {
    return (
      <div className="admin-page">
        <form className="admin-pin" onSubmit={handleLogin}>
          <span className="eyebrow">MNX</span>
          <h1 className="shop-title">Admin Login</h1>
          <p className="admin-muted">Sign in to manage product photos, offers, and orders.</p>
          <div className="admin-field">
            <label htmlFor="admin-email">Email address</label>
            <input
              id="admin-email"
              className="admin-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              className="admin-input"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="admin-btn primary" type="submit">
            Sign in
          </button>
          {authState.error && <p className="admin-error">{authState.error}</p>}
        </form>
      </div>
    );
  }

  // 2FA required - show verification
  if (authState.status === "mfa_required") {
    return (
      <div className="admin-page">
        <form className="admin-pin" onSubmit={handle2FAVerify}>
          <span className="eyebrow">MNX</span>
          <h1 className="shop-title">Two-Factor Authentication</h1>
          <p className="admin-muted">Enter the verification code from your authenticator app.</p>
          <div className="admin-field">
            <label htmlFor="admin-2fa-code">6-digit code</label>
            <input
              id="admin-2fa-code"
              className="admin-input"
              type="text"
              maxLength="6"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>
          <button className="admin-btn primary" type="submit">
            Verify
          </button>
          <button
            className="admin-btn"
            type="button"
            onClick={() => setAuthState((prev) => ({ ...prev, status: "unauthenticated" }))}
          >
            Back to login
          </button>
          <div className="admin-field">
            <label htmlFor="admin-recovery-code">Or use a recovery code</label>
            <input
              id="admin-recovery-code"
              className="admin-input"
              type="text"
              maxLength="8"
              autoComplete="off"
            />
          </div>
          <button className="admin-btn" type="button" onClick={handle2FARecovery}>
            Use recovery code
          </button>
          {authState.error && <p className="admin-error">{authState.error}</p>}
        </form>
      </div>
    );
  }

  // 2FA mandatory setup - new accounts must set up TOTP before dashboard access
  if (authState.status === "2fa_setup") {
    return (
      <div className="admin-page">
        <form className="admin-pin" onSubmit={handle2FAEnable}>
          <span className="eyebrow">MNX</span>
          <h1 className="shop-title">Set Up Two-Factor Authentication</h1>
          <p className="admin-muted">
            2FA is mandatory. Scan the QR code with Google Authenticator, Authy, or any TOTP app,
            then enter the 6-digit code to enable it.
          </p>

          <div className="admin-field">
            <label>QR Code</label>
            <div className="admin-qr">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code for 2FA setup" />
              ) : (
                <span className="admin-muted">Generating QR code…</span>
              )}
            </div>
            <p className="admin-muted">Or enter this secret manually:</p>
            <code className="admin-secret">{authState.totp_secret}</code>
          </div>

          <div className="admin-field">
            <label>6-digit verification code</label>
            <input
              id="admin-2fa-setup-code"
              className="admin-input"
              type="text"
              maxLength="6"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </div>

          <div className="admin-field">
            <label>Recovery codes (save these!)</label>
            <div className="admin-recovery-codes">
              {(authState.recovery_codes || []).map((code, i) => (
                <span key={i} className="admin-recovery-code">{code}</span>
              ))}
            </div>
            <p className="admin-muted">
              Save these codes in a secure location. They are your only way to access your account
              if you lose your authenticator app.
            </p>
          </div>

          {authState.error && <p className="admin-error">{authState.error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="admin-btn primary" type="submit">
              Enable 2FA
            </button>
            <button
              className="admin-btn"
              type="button"
              onClick={() => setAuthState((prev) => ({ ...prev, status: "unauthenticated" }))}
            >
              Back to login
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------- Authenticated editor ----------
  return (
    <div className="admin-page">
      <header className="admin-head">
        <div className="wrap admin-head-inner">
          <div>
            <span className="eyebrow">MNX · Admin</span>
            <h1 className="shop-title">Store Manager</h1>
          </div>
          <div className="admin-head-actions">
            <span className="admin-muted">
              Signed in as {authState.user?.email}
            </span>
            <button className="admin-btn" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="wrap admin-body">
        {!configured && tab === "photos" && (
          <p className="admin-error">
            Supabase isn&rsquo;t configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing), so
            photos can&rsquo;t be uploaded.
          </p>
        )}

        {/* ============ PHOTOS TAB ============ */}
        {tab === "photos" && (
          <>
            {error && <p className="admin-error">{error}</p>}
            {notice && !error && <p className="admin-notice">{notice}</p>}

            <div className="admin-controls">
              <label className="admin-field">
                <span>Product</span>
                <select
                  className="admin-input"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">
                    {loading ? "Loading products…" : "— choose a product —"}
                  </option>
                  {visibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.variant_name ? ` (${p.variant_name})` : ""} · {p.cat} · {p.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(e) => setOnlyMissing(e.target.checked)}
                />
                <span>Only products with no photos</span>
              </label>

              {groupSiblings.length > 1 && (
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={applyToGroup}
                    onChange={(e) => setApplyToGroup(e.target.checked)}
                  />
                  <span>
                    Apply to all {groupSiblings.length} variants in this group
                  </span>
                </label>
              )}
            </div>

            {selected ? (
              <>
                <div
                  className={`admin-drop${dragging ? " dragging" : ""}${busy ? " busy" : ""}`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragDepth.current += 1;
                    setDragging(true);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dragDepth.current -= 1;
                    if (dragDepth.current <= 0) setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dragDepth.current = 0;
                    setDragging(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInput.current?.click();
                    }
                  }}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <strong>{busy ? "Uploading…" : "Drop photos here"}</strong>
                  <span>or tap to choose · up to {MAX_FILES_PER_UPLOAD} at a time · JPG PNG WEBP</span>
                </div>

                {draft.length === 0 ? (
                  <p className="admin-muted center">
                    No photos yet — this product is showing placeholder art on the storefront.
                  </p>
                ) : (
                  <>
                    <ul className="admin-grid">
                      {draft.map((url, i) => (
                        <li key={url} className={`admin-tile${broken.has(url) ? " broken" : ""}`}>
                          <div className="admin-thumb">
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              onError={() => markBroken(url)}
                            />
                            {i === 0 && <span className="admin-badge">Main</span>}
                            {broken.has(url) && <span className="admin-badge error">Missing file</span>}
                          </div>
                          <div className="admin-tile-actions">
                            <button
                              className="admin-btn tiny"
                              type="button"
                              onClick={() => move(i, -1)}
                              disabled={i === 0}
                              aria-label="Move earlier"
                            >
                              ↑
                            </button>
                            <button
                              className="admin-btn tiny"
                              type="button"
                              onClick={() => move(i, 1)}
                              disabled={i === draft.length - 1}
                              aria-label="Move later"
                            >
                              ↓
                            </button>
                            <button
                              className="admin-btn tiny"
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(url);
                                showToast("URL copied");
                              }}
                            >
                              Copy
                            </button>
                            <button
                              className="admin-btn tiny danger"
                              type="button"
                              onClick={() => remove(url)}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="admin-save">
                      <button
                        className="admin-btn primary"
                        type="button"
                        onClick={save}
                        disabled={busy || !dirty}
                      >
                        {busy ? "Saving…" : "Save photos"}
                      </button>
                      {dirty && <span className="admin-muted">Unsaved changes</span>}
                      {!dirty && <span className="admin-muted">Up to date</span>}
                    </div>

                    {pendingOrphans.length > 0 && (
                      <div className="admin-save">
                        <button
                          className="admin-btn danger"
                          type="button"
                          onClick={purgeOrphans}
                          disabled={busy}
                        >
                          Delete {pendingOrphans.length} unused file
                          {pendingOrphans.length === 1 ? "" : "s"}
                        </button>
                        <span className="admin-muted">
                          Removed from the list but still in storage — save first, then delete to free
                          space.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              !loading && <p className="admin-muted center">Choose a product to start.</p>
            )}
          </>
        )}

        {/* ============ OFFERS TAB ============ */}
        {tab === "offers" && (
          <>
            {offersError && <p className="admin-error">{offersError}</p>}
            {offersBusy && offers.length === 0 && (
              <p className="admin-muted center">Loading offers…</p>
            )}

            <div className="admin-controls admin-orders-header">
              <div style={{ flex: 1 }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
                  Product offers
                </span>
                <p className="admin-muted" style={{ margin: 0 }}>
                  Create promotions like &ldquo;2 for $15&rdquo;, &ldquo;Buy 2 Get 1 Free&rdquo; or
                  &ldquo;Every 2nd item 50% off&rdquo;. Active offers show on the product card &
                  checkout automatically.
                </p>
              </div>
              {!offersBusy && (
                <button className="admin-btn primary" type="button" onClick={() => resetOfferDraft()}>
                  Add offer
                </button>
              )}
            </div>

            <div className="admin-offer-form">
              {showOfferForm ? (
                <>
                  <form className="admin-form" onSubmit={(e) => e.preventDefault()}>
                    <label className="admin-field">
                      <span>Product</span>
                      <select
                        className="admin-input"
                        value={offerDraft.productId}
                        onChange={(e) =>
                          setOfferDraft((prev) => ({ ...prev, productId: e.target.value }))
                        }
                      >
                        <option value="">— choose a product —</option>
                        {[...products]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.cat}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Offer title</span>
                      <input
                        className="admin-input"
                        value={offerDraft.title}
                        onChange={(e) =>
                          setOfferDraft((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder="e.g. 2 for $15"
                      />
                    </label>

                    <label className="admin-field">
                      <span>Subtitle</span>
                      <input
                        className="admin-input"
                        value={offerDraft.subtitle}
                        onChange={(e) =>
                          setOfferDraft((prev) => ({ ...prev, subtitle: e.target.value }))
                        }
                        placeholder="Optional supporting line"
                      />
                    </label>

                    <label className="admin-field">
                      <span>Type</span>
                      <select
                        className="admin-input"
                        value={offerDraft.kind}
                        onChange={(e) =>
                          setOfferDraft((prev) => ({
                            ...prev,
                            kind: e.target.value,
                            config: {},
                          }))
                        }
                      >
                        <option value="x_for_price">Multi-buy price (X for $N)</option>
                        <option value="bogo">Buy X Get Y Free</option>
                        <option value="percent_off_second">Every 2nd item % off</option>
                        <option value="bulk_discount">Bulk discount (buy more than N for price Y)</option>
                      </select>
                    </label>

                    <div className="admin-offer-config">
                      {offerDraft.kind === "x_for_price" && (
                        <>
                          <label className="admin-field">
                            <span>Buy this many</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="1"
                              value={offerDraft.config.quantity || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, quantity: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                          <label className="admin-field">
                            <span>For this total price</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={offerDraft.config.price || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, price: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                      {offerDraft.kind === "bogo" && (
                        <>
                          <label className="admin-field">
                            <span>Buy</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="1"
                              value={offerDraft.config.buy || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, buy: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                          <label className="admin-field">
                            <span>Get free</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="1"
                              value={offerDraft.config.get || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, get: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                      {offerDraft.kind === "percent_off_second" && (
                        <label className="admin-field">
                          <span>Discount on every 2nd item</span>
                          <input
                            className="admin-input"
                            type="number"
                            min="1"
                            max="99"
                            value={offerDraft.config.percent || ""}
                            onChange={(e) =>
                              setOfferDraft((prev) => ({
                                ...prev,
                                config: { ...prev.config, percent: Number(e.target.value) || 0 },
                              }))
                            }
                          />
                        </label>
                      )}
                      {offerDraft.kind === "bulk_discount" && (
                        <>
                          <label className="admin-field">
                            <span>Buy more than this many units</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="0"
                              value={offerDraft.config.minQuantity || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, minQuantity: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                          <label className="admin-field">
                            <span>Regular unit price</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={offerDraft.config.regularPrice || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, regularPrice: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                          <label className="admin-field">
                            <span>Bulk price per unit</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={offerDraft.config.bulkPrice || ""}
                              onChange={(e) =>
                                setOfferDraft((prev) => ({
                                  ...prev,
                                  config: { ...prev.config, bulkPrice: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>

                    <div className="admin-save" style={{ borderTop: "none", paddingTop: 10 }}>
                      <label className="admin-check" style={{ marginRight: 16 }}>
                        <input
                          type="checkbox"
                          checked={offerDraft.active}
                          onChange={(e) =>
                            setOfferDraft((prev) => ({ ...prev, active: e.target.checked }))
                          }
                        />
                        <span>Active</span>
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <label className="admin-field" style={{ flex: 1 }}>
                          <span>Starts</span>
                          <input
                            className="admin-input"
                            type="datetime-local"
                            value={offerDraft.startsAt}
                            onChange={(e) =>
                              setOfferDraft((prev) => ({ ...prev, startsAt: e.target.value }))
                            }
                          />
                        </label>
                        <label className="admin-field" style={{ flex: 1 }}>
                          <span>Ends</span>
                          <input
                            className="admin-input"
                            type="datetime-local"
                            value={offerDraft.endsAt}
                            onChange={(e) =>
                              setOfferDraft((prev) => ({ ...prev, endsAt: e.target.value }))
                            }
                          />
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                        <button className="admin-btn primary" type="button" onClick={saveOffer}
                          disabled={offersBusy}>
                          {offersBusy ? "Saving…" : editingOffer ? "Update offer" : "Create offer"}
                        </button>
                        <button className="admin-btn" type="button" onClick={() => setShowOfferForm(false)}
                          disabled={offersBusy}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              ) : (
                <div className="admin-offer-list">
                  <table className="offer-table">
                    <thead>
                      <tr>
                        <th>Offer</th>
                        <th>Product</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Valid</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => {
                        const active = o.active &&
                          new Date(o.starts_at || 0) <= new Date() &&
                          new Date(o.ends_at || 0) > new Date();
                        return (
                          <tr key={o.id} className={`offer-row${active ? "" : " inactive"}`}>
                            <td>
                              <strong>{o.title}</strong>
                              {o.subtitle && <span className="offer-sub">{o.subtitle}</span>}
                            </td>
                            <td>{productForOffer.get(o.product_id) || o.product_id}</td>
                            <td>
                              <span className={`offer-kind ${o.kind}`}>{offerSummary(o)}</span>
                            </td>
                            <td>
                              <button
                                className={`admin-btn tiny ${active ? "danger" : ""}`}
                                type="button"
                                onClick={() => toggleOffer(o.id, active)}
                                disabled={offersBusy}
                              >
                                {active ? "Pause" : "Activate"}
                              </button>
                            </td>
                            <td>
                              {new Date(o.starts_at || 0).toLocaleDateString()} &rarr;
                              {new Date(o.ends_at || 0).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="admin-btn tiny"
                                type="button"
                                onClick={() => {
                                  resetOfferDraft(o);
                                  setTab("offers");
                                }}
                                disabled={offersBusy}
                              >
                                Edit
                              </button>
                              <button
                                className="admin-btn tiny danger"
                                type="button"
                                onClick={() => removeOffer(o.id)}
                                disabled={offersBusy}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                    })}
                      {offers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="admin-muted center">
                            No offers yet. Add your first promotion above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {auditUnavailable && (
                <p className="admin-muted">
                  Run <strong>ADMIN_AUDIT_LOG.sql</strong> in the SQL Editor to start recording offer
                  changes.
                </p>
              )}
              {auditEntries.length > 0 && (
                <section className="admin-activity">
                  <div className="admin-save">
                    <h2 className="admin-subtitle">Recent changes</h2>
                    <button className="admin-btn" type="button" onClick={refreshOffers}>
                      Refresh
                    </button>
                  </div>
                  <ul className="admin-log">
                    {auditEntries.map((e) => (
                      <li key={e.id} className="admin-log-row">
                        <span className={`admin-log-dot ${e.action}`} aria-hidden="true" />
                        <span className="admin-log-actor">{e.actor}</span>
                        <span className="admin-log-action">
                          {e.action === "create"
                            ? "created"
                            : e.action === "update"
                              ? "updated"
                              : "deleted"}
                        </span>
                        <span className="admin-log-detail">{e.detail}</span>
                        <time className="admin-log-time" dateTime={e.created_at}>
                          {timeAgo(e.created_at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              </div>
            </>
          )}

        {/* ============ ORDERS TAB ============ */}
        {tab === "orders" && (
          <>
            {ordersError && <p className="admin-error">{ordersError}</p>}
            {ordersBusy && orders.length === 0 && (
              <p className="admin-muted center">Loading orders…</p>
            )}

            <div className="admin-controls admin-orders-header">
              <div style={{ flex: 1 }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>
                  Order Management
                </span>
                <p className="admin-muted" style={{ margin: 0 }}>
                  View all orders, track status, and update shipping progress.
                </p>
              </div>
              {orders.length === 0 && !ordersBusy && (
                <p className="admin-muted">No orders yet.</p>
              )}
            </div>

            <div className="admin-orders-table-wrap">
              <table className="admin-orders-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Wilaya / Commune</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {renderOrderGroups()}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={10} className="admin-muted center">
                        No orders found.
                      </td>
                    </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        )}
      </div>
    </div>
  );
}

/** Compact "3m ago" / "2d ago" stamp for the activity list. */
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Group orders by day and render with date separators. */
function renderOrderGroups() {
  const groups = new Map();
  for (const o of orders) {
    const day = new Date(o.created_at || 0).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(o);
  }

  const rows = [];
  for (const [day, dayOrders] of groups.entries()) {
    rows.push(
      <tr key={`day-${day}`} className="admin-orders-day">
        <td colSpan={10} className="admin-orders-day-label">
          {day}
        </td>
      </tr>
    );
    for (const o of dayOrders) {
      const items = summarizeItems(o);
      const date = new Date(o.created_at || 0).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const isNoAnswer = o.status.startsWith("no answer");
      const callCount = isNoAnswer
        ? Number(o.status.replace("no answer ", "") || 1)
        : 0;
      rows.push(
        <tr key={o.id} className="admin-orders-row">
          <td>
            <strong>{o.order_number}</strong>
          </td>
          <td>{o.customer_name}</td>
          <td>{formatPhone(o.phone)}</td>
          <td>
            {o.wilaya} / {o.commune || "—"}
          </td>
          <td style={{ maxWidth: "260px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {items}
          </td>
          <td>
            {o.total != null ? `DZD ${Number(o.total).toLocaleString()}` : "-"}
          </td>
          <td className="admin-orders-date">{date}</td>
          <td>
            <select
              className={`admin-orders-status ${o.status.replace(" ", "-")}`}
              value={o.status}
              onChange={(e) => {
                const newStatus = e.target.value;
                if (!newStatus) return;
                setOrdersBusy(true);
                setOrdersError("");
                updateOrderStatus({ id: o.id, status: newStatus, actor: "" })
                  .then(() => {
                    setOrders((prev) =>
                      prev.map((p) =>
                        p.id === o.id ? { ...p, status: newStatus } : p
                      )
                    );
                    showToast(`Order ${o.order_number} updated`);
                  })
                  .catch((err) => {
                    setOrdersError(err.message || "Could not update order.");
                  })
                  .finally(() => setOrdersBusy(false));
              }}
            >
              {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </td>
          <td>
            <input
              className="admin-input"
              type="text"
              value={o.notes || ""}
              placeholder="Add a note…"
              onChange={(e) => {
                setOrdersBusy(true);
                setOrdersError("");
                updateOrderNotes({
                  id: o.id,
                  notes: e.target.value,
                  pin: "",
                })
                  .then(() => {
                    setOrders((prev) =>
                      prev.map((p) =>
                        p.id === o.id ? { ...p, notes: e.target.value } : p
                      )
                    );
                  })
                  .catch((err) => {
                    setOrdersError(err.message || "Could not save note.");
                  })
                  .finally(() => setOrdersBusy(false));
              }}
            />
          </td>
          <td style={{ textAlign: "right" }}>
            {isNoAnswer && callCount < 3 ? (
              <button
                className="admin-btn tiny"
                type="button"
                onClick={() => {
                  const next = `no answer ${callCount + 1}`;
                  setOrdersBusy(true);
                  setOrdersError("");
                  updateOrderStatus({ id: o.id, status: next, actor: "" })
                    .then(() => {
                      setOrders((prev) =>
                        prev.map((p) =>
                          p.id === o.id ? { ...p, status: next } : p
                        )
                      );
                      showToast(`Call logged: ${next}`);
                    })
                    .catch((err) => {
                      setOrdersError(err.message || "Could not log call.");
                    })
                    .finally(() => setOrdersBusy(false));
                }}
                disabled={ordersBusy}
              >
                Call Client ({callCount + 1}/3)
              </button>
            ) : isNoAnswer ? (
              <span className="admin-muted">Max calls reached</span>
            ) : (
              <span className="admin-muted">—</span>
            )}
            {o.tracking_number ? (
              <>
                <br />
                <span className="admin-orders-tracking">
                  📦 {o.tracking_number}
                </span>
              </>
            ) : null}
          </td>
        </tr>
      );
    }
  }
  return rows;
}
