import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../hooks/useToast';
import {
  MAX_FILES_PER_UPLOAD,
  deleteProductImages,
  isManagedImageUrl,
  isStorageConfigured,
  saveProductImages,
  shrinkImage,
  uploadProductImages,
  validateImageFile,
} from '../services/storage';
import {
  createOffer,
  deleteOffer,
  fetchAdminActivity,
  fetchAllOffers,
  updateOffer,
} from '../services/offers';
import './AdminImages.css';

const PIN_STORAGE_KEY = 'mnx-admin-pin';
const ACTOR_STORAGE_KEY = 'mnx-admin-actor';

export default function AdminImages() {
  const { products, loading, applyImageUpdate } = useProducts();
  const { showToast } = useToast();

  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_STORAGE_KEY) || '');
  const [pinInput, setPinInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [actor, setActor] = useState(() => sessionStorage.getItem(ACTOR_STORAGE_KEY) || '');
  const [actorInput, setActorInput] = useState('');

  const [tab, setTab] = useState('photos'); // 'photos' | 'offers'

  // ---------- photos state ----------
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState([]);
  const [savedUrls, setSavedUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    sessionStorage.removeItem(PIN_STORAGE_KEY);
    setPin('');
    setUnlocked(false);
    setPinInput('');
    sessionStorage.removeItem(ACTOR_STORAGE_KEY);
    setActor('');
    setActorInput('');
    setTab('photos');
  };

  const submitPin = (e) => {
    e.preventDefault();
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    sessionStorage.setItem(PIN_STORAGE_KEY, trimmed);
    setPin(trimmed);
    setUnlocked(true);
    setPinInput('');
    setError('');
  };

  useEffect(() => {
    if (!selected) {
      setDraft([]);
      setSavedUrls([]);
      setBroken(new Set());
      setOrphansCleaned(false);
      setError('');
      setNotice('');
    } else {
      const existing = Array.isArray(selected.image_urls) && selected.image_urls.length
        ? [...selected.image_urls]
        : selected.image_url
          ? [selected.image_url]
          : [];
      setDraft(existing);
      setSavedUrls(existing);
      setBroken(new Set());
      setOrphansCleaned(false);
      setError('');
      setNotice('');
    }
  }, [selected]);

  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const markBroken = (url) => setBroken((prev) => new Set(prev).add(url));

  const handleFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length || !selected) return;

    const problems = incoming.map(validateImageFile).filter(Boolean);
    if (problems.length) {
      setError(problems.join(' '));
      setNotice('');
      return;
    }
    setError('');
    setNotice('');
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
        pin,
        actor,
      });
      setDraft((prev) => [...prev, ...urls]);
      setNotice(
        [
          skipped.length
            ? `Uploaded ${urls.length}. Could not read: ${skipped.join(', ')}.`
            : `Uploaded ${urls.length} photo${urls.length === 1 ? '' : 's'}.`,
          dropped ? `Skipped ${dropped} beyond the ${MAX_FILES_PER_UPLOAD}-at-a-time limit.` : '',
          'Press Save to publish.',
        ]
          .filter(Boolean)
          .join(' ')
      );
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
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
    setError('');
    try {
      await saveProductImages({ productIds: targetIds, urls: draft, pin, actor });
      applyImageUpdate(targetIds, draft);
      setSavedUrls(draft);
      setNotice(
        targetIds.length > 1
          ? `Saved across ${targetIds.length} variants.`
          : 'Saved. The storefront now uses these photos.'
      );
      showToast('Photos saved');
      refreshOffers();
    } catch (err) {
      setError(err.message || 'Could not save the photos.');
    } finally {
      setBusy(false);
    }
  };

  const purgeOrphans = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteProductImages({ urls: orphans, pin, actor });
      setNotice(`Deleted ${orphans.length} unused file${orphans.length === 1 ? '' : 's'}.`);
      setOrphansCleaned(true);
      refreshOffers();
    } catch (err) {
      setError(err.message || 'Could not delete those files.');
    } finally {
      setBusy(false);
    }
  };

  const pendingOrphans = dirty || orphansCleaned ? [] : orphans;

  // ---------- offers state ----------
  const [offers, setOffers] = useState([]);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState('');
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditUnavailable, setAuditUnavailable] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [offerDraft, setOfferDraft] = useState({
    productId: '',
    title: '',
    subtitle: '',
    kind: 'x_for_price',
    config: {},
    active: true,
    startsAt: '',
    endsAt: '',
  });

  const refreshOffers = useCallback(async () => {
    try {
      const [list, activity] = await Promise.all([
        fetchAllOffers(pin),
        fetchAdminActivity({ pin }),
      ]);
      setOffers(list);
      setAuditEntries(activity.entries);
      setAuditUnavailable(activity.unavailable);
      setOffersError('');
    } catch (err) {
      setOffersError(err.message || 'Could not load offers.');
      setOffers([]);
    }
  }, [pin]);

  useEffect(() => {
    if (unlocked && tab === 'offers') refreshOffers();
  }, [unlocked, tab, refreshOffers]);

  const productForOffer = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const resetOfferDraft = (offer = null) => {
    setOfferDraft(offer
      ? {
          productId: offer.product_id,
          title: offer.title || '',
          subtitle: offer.subtitle || '',
          kind: offer.kind,
          config: offer.config || {},
          active: offer.active,
          startsAt: offer.starts_at ? offer.starts_at.slice(0, 16) : '',
          endsAt: offer.ends_at ? offer.ends_at.slice(0, 16) : '',
        }
      : {
          productId: '',
          title: '',
          subtitle: '',
          kind: 'x_for_price',
          config: {},
          active: true,
          startsAt: '',
          endsAt: '',
        });
    setEditingOffer(offer ? offer.id : null);
  };

  const saveOffer = async () => {
    const { productId, title, subtitle, kind, config, active, startsAt, endsAt } = offerDraft;
    if (!productId || !title || !kind) {
      setOffersError('Product, title and type are required.');
      return;
    }
    setOffersBusy(true);
    setOffersError('');
    try {
      if (editingOffer) {
        await updateOffer({
          id: editingOffer,
          updates: { productId, title, subtitle, kind, config, active, startsAt, endsAt },
          pin,
        });
      } else {
        await createOffer({ productId, title, subtitle, kind, config, active, startsAt, endsAt, pin });
      }
      setOfferDraft({
        productId: '',
        title: '',
        subtitle: '',
        kind: 'x_for_price',
        config: {},
        active: true,
        startsAt: '',
        endsAt: '',
      });
      setEditingOffer(null);
      await refreshOffers();
      showToast('Offer saved');
    } catch (err) {
      setOffersError(err.message || 'Could not save the offer.');
    } finally {
      setOffersBusy(false);
    }
  };

  const removeOffer = async (id) => {
    if (!window.confirm('Delete this offer?')) return;
    setOffersBusy(true);
    setOffersError('');
    try {
      await deleteOffer({ id, pin });
      await refreshOffers();
      showToast('Offer deleted');
    } catch (err) {
      setOffersError(err.message || 'Could not delete the offer.');
    } finally {
      setOffersBusy(false);
    }
  };

  const toggleOffer = async (id, active) => {
    setOffersBusy(true);
    setOffersError('');
    try {
      await updateOffer({ id, updates: { active: !active }, pin });
      await refreshOffers();
    } catch (err) {
      setOffersError(err.message || 'Could not update offer.');
    } finally {
      setOffersBusy(false);
    }
  };

  const offerSummary = (o) => {
    const c = o.config || {};
    if (o.kind === 'x_for_price') return `${Number(c.quantity) || 0} for $${(Number(c.price) || 0).toFixed(2)}`;
    if (o.kind === 'bogo') return `Buy ${Number(c.buy) || 0} Get ${Number(c.get) || 0} Free`;
    if (o.kind === 'percent_off_second') return `2nd item ${Number(c.percent) || 0}% off`;
    return o.kind;
  };

  // ---------- render gate ----------
  if (!unlocked) {
    return (
      <div className="admin-page">
        <form className="admin-pin" onSubmit={submitPin}>
          <span className="eyebrow">MNX</span>
          <h1 className="shop-title">Admin</h1>
          <p className="admin-muted">Enter the admin PIN to manage product photos & offers.</p>
          <input
            className="admin-input"
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            aria-label="Admin PIN"
            autoComplete="current-password"
            autoFocus
          />
          <button className="admin-btn primary" type="submit" disabled={!pinInput.trim()}>
            Unlock
          </button>
          {error && <p className="admin-error">{error}</p>}
        </form>
      </div>
    );
  }

  // ---------- editor ----------
  return (
    <div className="admin-page">
      <header className="admin-head">
        <div className="wrap admin-head-inner">
          <div>
            <span className="eyebrow">MNX · Admin</span>
            <h1 className="shop-title">Store Manager</h1>
          </div>
          <div className="admin-head-actions">
            <form
              className="admin-who"
              onSubmit={(e) => {
                e.preventDefault();
                const name = actorInput || actor;
                setActor(name);
                if (name) sessionStorage.setItem(ACTOR_STORAGE_KEY, name);
                else sessionStorage.removeItem(ACTOR_STORAGE_KEY);
                setActorInput(name);
              }}
            >
              <label htmlFor="admin-actor">Acting as</label>
              <input
                id="admin-actor"
                className="admin-input"
                value={actorInput}
                placeholder={actor || 'Your name'}
                onChange={(e) => setActorInput(e.target.value)}
                onBlur={() => {
                  const name = actorInput || actor;
                  setActor(name);
                  if (name) sessionStorage.setItem(ACTOR_STORAGE_KEY, name);
                  else sessionStorage.removeItem(ACTOR_STORAGE_KEY);
                  setActorInput(name);
                }}
                maxLength={60}
              />
            </form>
            <div className="admin-tabs">
              <button
                className={`admin-tab${tab === 'photos' ? ' active' : ''}`}
                type="button"
                onClick={() => setTab('photos')}
              >
                Photos
              </button>
              <button
                className={`admin-tab${tab === 'offers' ? ' active' : ''}`}
                type="button"
                onClick={() => setTab('offers')}
              >
                Offers
              </button>
            </div>
            <button className="admin-btn" type="button" onClick={lock}>
              Lock
            </button>
          </div>
        </div>
      </header>

      <div className="wrap admin-body">
        {!configured && tab === 'photos' && (
          <p className="admin-error">
            Supabase isn&rsquo;t configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing), so
            photos can&rsquo;t be uploaded.
          </p>
        )}

        {/* ============ PHOTOS TAB ============ */}
        {tab === 'photos' && (
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
                    {loading ? 'Loading products…' : '— choose a product —'}
                  </option>
                  {visibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.variant_name ? ` (${p.variant_name})` : ''} · {p.cat} · {p.id}
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
                  className={`admin-drop${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
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
                    if (e.key === 'Enter' || e.key === ' ') {
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
                  <strong>{busy ? 'Uploading…' : 'Drop photos here'}</strong>
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
                        <li key={url} className={`admin-tile${broken.has(url) ? ' broken' : ''}`}>
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
                                showToast('URL copied');
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
                        {busy ? 'Saving…' : 'Save photos'}
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
                          {pendingOrphans.length === 1 ? '' : 's'}
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
        {tab === 'offers' && (
          <>
            {offersError && <p className="admin-error">{offersError}</p>}
            {offersBusy && offers.length === 0 && <p className="admin-muted center">Loading offers…</p>}

            <div className="admin-controls">
              <div style={{ flex: 1 }}>
                <span className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>
                  Product offers
                </span>
                <p className="admin-muted" style={{ margin: 0 }}>
                  Create promotions like &ldquo;2 for $15&rdquo;, &ldquo;Buy 2 Get 1 Free&rdquo; or
                  &ldquo;Every 2nd item 50% off&rdquo;. Active offers show on the product card &
                  checkout automatically.
                </p>
              </div>
              {offers.length === 0 && !offersBusy && (
                <button className="admin-btn primary" type="button" onClick={() => resetOfferDraft()}>
                  Add offer
                </button>
              )}
            </div>

            <div className="admin-offer-form">
              {editingOffer || offerDraft.productId ? (
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
                      </select>
                    </label>

                    <div className="admin-offer-config">
                      {offerDraft.kind === 'x_for_price' && (
                        <>
                          <label className="admin-field">
                            <span>Buy this many</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="1"
                              value={offerDraft.config.quantity || ''}
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
                              value={offerDraft.config.price || ''}
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
                      {offerDraft.kind === 'bogo' && (
                        <>
                          <label className="admin-field">
                            <span>Buy</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="1"
                              value={offerDraft.config.buy || ''}
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
                              value={offerDraft.config.get || ''}
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
                      {offerDraft.kind === 'percent_off_second' && (
                        <label className="admin-field">
                          <span>Discount on every 2nd item</span>
                          <input
                            className="admin-input"
                            type="number"
                            min="1"
                            max="99"
                            value={offerDraft.config.percent || ''}
                            onChange={(e) =>
                              setOfferDraft((prev) => ({
                                ...prev,
                                config: { ...prev.config, percent: Number(e.target.value) || 0 },
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>

                    <div className="admin-save" style={{ borderTop: 'none', paddingTop: 10 }}>
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
                      <div style={{ display: 'flex', gap: 8 }}>
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
                      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                        <button className="admin-btn primary" type="button" onClick={saveOffer}
                          disabled={offersBusy}>
                          {offersBusy ? 'Saving…' : editingOffer ? 'Update offer' : 'Create offer'}
                        </button>
                        <button className="admin-btn" type="button" onClick={resetOfferDraft}
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
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => {
                        const active = o.active &&
                          new Date(o.starts_at || 0) <= new Date() &&
                          new Date(o.ends_at || 0) > new Date();
                        return (
                          <tr key={o.id} className={`offer-row${active ? '' : ' inactive'}`}>
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
                                className={`admin-btn tiny ${active ? 'danger' : ''}`}
                                type="button"
                                onClick={() => toggleOffer(o.id, active)}
                                disabled={offersBusy}
                              >
                                {active ? 'Pause' : 'Activate'}
                              </button>
                            </td>
                            <td>
                              {new Date(o.starts_at || 0).toLocaleDateString()} &rarr;
                              {new Date(o.ends_at || 0).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="admin-btn tiny"
                                type="button"
                                onClick={() => {
                                  resetOfferDraft(o);
                                  setTab('offers');
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
            </div>
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
                        {e.action === 'create'
                          ? 'created'
                          : e.action === 'update'
                            ? 'updated'
                            : 'deleted'}
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
          </>
        )}
      </div>
    </div>
  );
}
