import { useEffect, useMemo, useRef, useState } from 'react';
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
import './AdminImages.css';

// Hidden admin screen for attaching product photos to Supabase Storage.
// Not linked from the navbar — reach it by typing /admin. The PIN is not
// the security boundary (a VITE_ value would be readable in the bundled
// JS); the real gate is the admin-images Edge Function, which refuses
// every write without the server-side ADMIN_PIN secret.
const PIN_STORAGE_KEY = 'mnx-admin-pin';

export default function AdminImages() {
  const { products, loading, applyImageUpdate } = useProducts();
  const { showToast } = useToast();

  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_STORAGE_KEY) || '');
  const [pinInput, setPinInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);

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

  // Drops the cached PIN and returns to the gate. Rotating ADMIN_PIN
  // server-side instantly invalidates anyone still on an old value,
  // because every write re-checks it.
  const lock = () => {
    sessionStorage.removeItem(PIN_STORAGE_KEY);
    setPin('');
    setUnlocked(false);
    setPinInput('');
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

  // Load the selected product's current photos into the draft editor.
  useEffect(() => {
    if (!selected) {
      setDraft([]);
      setSavedUrls([]);
      return;
    }
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
  }, [selected]);

  // Files dropped across the whole window shouldn't navigate away.
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
      // Shrink before uploading: phone photos are routinely 5–10 MB and
      // every one of those megabytes is dead weight on a storefront.
      const accepted = incoming.slice(0, MAX_FILES_PER_UPLOAD);
      const dropped = incoming.length - accepted.length;
      const prepared = [];
      for (const file of accepted) {
        try {
          prepared.push(await shrinkImage(file));
        } catch {
          // Canvas/ImageBitmap unavailable or the file isn't decodable —
          // fall back to the original rather than dropping the photo.
          prepared.push(file);
        }
      }

      const { urls, skipped } = await uploadProductImages({
        productId: selected.id,
        files: prepared,
        pin,
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
      await saveProductImages({ productIds: targetIds, urls: draft, pin });
      applyImageUpdate(targetIds, draft);
      setSavedUrls(draft);
      setNotice(
        targetIds.length > 1
          ? `Saved across ${targetIds.length} variants.`
          : 'Saved. The storefront now uses these photos.'
      );
      showToast('Photos saved');
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
      await deleteProductImages({ urls: orphans, pin });
      setNotice(`Deleted ${orphans.length} unused file${orphans.length === 1 ? '' : 's'}.`);
      setOrphansCleaned(true);
    } catch (err) {
      setError(err.message || 'Could not delete those files.');
    } finally {
      setBusy(false);
    }
  };

  // Gated on `!dirty`: the deleted files must already be out of the saved
  // row, otherwise this would strand the product pointing at objects that
  // are about to be destroyed.
  const pendingOrphans = dirty || orphansCleaned ? [] : orphans;

  // ---------- PIN gate ----------
  if (!unlocked) {
    return (
      <div className="admin-page">
        <form className="admin-pin" onSubmit={submitPin}>
          <span className="eyebrow">MNX</span>
          <h1 className="shop-title">Admin</h1>
          <p className="admin-muted">Enter the admin PIN to manage product photos.</p>
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

  // ---------- Editor ----------
  return (
    <div className="admin-page">
      <header className="admin-head">
        <div className="wrap admin-head-inner">
          <div>
            <span className="eyebrow">MNX · Admin</span>
            <h1 className="shop-title">Product Photos</h1>
          </div>
          <button className="admin-btn" type="button" onClick={lock}>
            Lock
          </button>
        </div>
      </header>

      <div className="wrap admin-body">
        {!configured && (
          <p className="admin-error">
            Supabase isn&rsquo;t configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing), so
            photos can&rsquo;t be uploaded.
          </p>
        )}

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

        {error && <p className="admin-error">{error}</p>}
        {notice && !error && <p className="admin-notice">{notice}</p>}

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
      </div>
    </div>
  );
}