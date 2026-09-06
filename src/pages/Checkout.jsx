import { useEffect, useMemo, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { useDelivery } from '../hooks/useDelivery';
import { useProducts } from '../hooks/useProducts';
import { submitOrder as submitOrderRequest } from '../services/api';
import { createShipment, fetchCommunes } from '../services/andersonApi';
import { fmt } from '../utils/format';
import { buildWhatsAppLink, DELIVERY_METHODS } from '../utils/constants';
import CheckoutForm from '../components/Checkout/CheckoutForm';
import OrderSummary from '../components/Checkout/OrderSummary';
import ConfirmScreen from '../components/Checkout/ConfirmScreen';
import ProductGrid from '../components/ProductGrid/ProductGrid';
import './Checkout.css';

/** Generates a short human-friendly order reference, e.g. "MNX-4821". */
function generateOrderNumber() {
  return `MNX-${Math.floor(1000 + Math.random() * 9000)}`;
}

const INITIAL_FORM = {
  name: '',
  phone: '',
  wilaya: '',
  commune: '',
  address: '',
  deliveryMethod: DELIVERY_METHODS[0].value,
  stopdeskLocation: '',
  notes: '',
};

/**
 * Accent/case-insensitive compare, so a stopdesk city like "AIN M'LILA"
 * matches Anderson's commune "Ain M'lila".
 */
function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the Anderson commune matching a stopdesk label
 * ("WILAYA - CITY" or "WILAYA (Main Stopdesk)"). Tries the city first,
 * then falls back to the wilaya itself (main desks usually sit in the
 * wilaya's eponymous commune).
 */
function matchCommuneForDesk(stopdeskLabel, communes) {
  if (!stopdeskLabel || !communes.length) return '';
  const dashAt = stopdeskLabel.indexOf(' - ');
  const city = dashAt >= 0 ? stopdeskLabel.slice(dashAt + 3) : '';
  const wilaya = dashAt >= 0 ? stopdeskLabel.slice(0, dashAt) : stopdeskLabel.replace(/\s*\(Main Stopdesk\)\s*$/i, '');
  for (const candidate of [city, wilaya]) {
    const norm = normalizeName(candidate);
    if (!norm) continue;
    const hit = communes.find((c) => normalizeName(c.name) === norm);
    if (hit) return hit.name;
  }
  return '';
}

export default function Checkout() {
  const { lineItems, cartTotal, clearCart } = useCart();
  const { showToast } = useToast();
  const { deliveryPrices, loading: deliveryLoading, findPrice } = useDelivery();
  const { products } = useProducts();

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null); // { orderNumber, trackingNumber } | null
  const [communes, setCommunes] = useState([]);
  const [communesLoading, setCommunesLoading] = useState(false);
  const [communesError, setCommunesError] = useState(null);

  // Official 1–58 code for the selected wilaya — drives both the
  // Anderson commune list and the shipment creation call.
  const wilayaCode = useMemo(
    () => deliveryPrices.find((d) => d.wilaya === form.wilaya)?.wilaya_code ?? null,
    [deliveryPrices, form.wilaya]
  );

  // Load Anderson's commune list whenever the wilaya changes. Results are
  // cached per wilaya inside andersonApi, so this is cheap to re-run.
  useEffect(() => {
    if (!wilayaCode) {
      setCommunes([]);
      setCommunesError(null);
      return;
    }
    let cancelled = false;
    setCommunesLoading(true);
    setCommunesError(null);
    fetchCommunes(wilayaCode).then(({ success, communes: list, error }) => {
      if (cancelled) return;
      setCommunesLoading(false);
      if (success) {
        setCommunes(list);
        // If a stopdesk was already picked, auto-match its commune now
        // that the list has arrived (unless the user already chose one).
        setForm((prev) => {
          if (prev.deliveryMethod !== 'stopdesk' || prev.commune || !prev.stopdeskLocation) return prev;
          const matched = matchCommuneForDesk(prev.stopdeskLocation, list);
          return matched ? { ...prev, commune: matched } : prev;
        });
      } else {
        setCommunes([]);
        setCommunesError(error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wilayaCode]);

  const handleFieldChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // A stopdesk/commune choice only makes sense for its wilaya + method —
      // clear both whenever either changes so a stale value can't be submitted.
      if (field === 'wilaya' || field === 'deliveryMethod') {
        next.stopdeskLocation = '';
        next.commune = '';
        return next;
      }
      // Picking a stopdesk pre-selects its Anderson commune (the courier
      // requires the commune name from their own list) — still editable.
      if (field === 'stopdeskLocation' && prev.deliveryMethod === 'stopdesk') {
        next.commune = matchCommuneForDesk(value, communes) || '';
      }
      return next;
    });
  };

  // Recomputed instantly whenever wilaya, delivery method, or the
  // underlying pricing table changes — this is what makes the
  // Subtotal/Delivery/Total breakdown in OrderSummary update live.
  const deliveryPrice = useMemo(() => {
    if (!form.wilaya) return null;
    return findPrice(form.wilaya, form.deliveryMethod);
  }, [form.wilaya, form.deliveryMethod, findPrice]);

  const deliveryLabel = useMemo(
    () => DELIVERY_METHODS.find((m) => m.value === form.deliveryMethod)?.label,
    [form.deliveryMethod]
  );

  const isDoorstep = form.deliveryMethod === 'homedelivery';

  // Post-checkout suggestions: featured first, in-stock preferred.
  const suggested = useMemo(() => {
    const pool = products.filter((p) => Number(p.stock) > 0);
    const base = pool.length ? pool : products;
    return [...base.filter((p) => p.featured), ...base.filter((p) => !p.featured)].slice(0, 4);
  }, [products]);

  const handleSubmit = async () => {
    if (!lineItems.length) {
      showToast('Your cart is empty');
      return;
    }
    if (!form.name.trim() || !form.phone.trim() || !form.wilaya) {
      showToast('Please fill in every field');
      return;
    }
    if (!form.commune.trim()) {
      showToast('Please select your commune');
      return;
    }
    if (isDoorstep && !form.address.trim()) {
      showToast('Please add a street address for doorstep delivery');
      return;
    }
    if (!isDoorstep && !form.stopdeskLocation) {
      showToast('Please select a stopdesk location');
      return;
    }
    if (deliveryPrice === null) {
      showToast('Please select a wilaya and delivery method');
      return;
    }

    setSubmitting(true);
    const orderNumber = generateOrderNumber();
    const itemLines = lineItems
      .map(({ product, qty, lineTotal }) => `${product.name} x${qty} — ${fmt(lineTotal)}`)
      .join('\n');
    const total = cartTotal + deliveryPrice;

    const { success, orderId } = await submitOrderRequest({
      orderNumber,
      name: form.name.trim(),
      phone: form.phone.trim(),
      wilaya: form.wilaya,
      commune: form.commune.trim(),
      address: isDoorstep ? form.address.trim() : null,
      stopdeskLocation: !isDoorstep ? form.stopdeskLocation : null,
      notes: form.notes.trim() || null,
      deliveryMethod: deliveryLabel,
      deliveryPrice,
      subtotal: cartTotal,
      total,
      itemLines,
      lineItems,
    });

    setSubmitting(false);

    if (!success) {
      showToast("Couldn't place order — please try again");
      return;
    }

    setConfirmedOrder({ orderNumber, trackingNumber: null });
    clearCart();
    setForm(INITIAL_FORM);

    // Best-effort: the order is already safely saved above regardless
    // of what happens here. If Anderson isn't configured yet, or their
    // system is briefly unavailable, the customer still sees a normal
    // confirmation — you can always create the shipment manually from
    // your Anderson dashboard using the order details.
    if (orderId) {
      createShipment({
        orderId,
        orderNumber,
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        wilaya: form.wilaya,
        wilayaCode,
        commune: form.commune.trim(),
        // adresse is required by Anderson even for stopdesk — send the
        // chosen desk label in that case.
        address: isDoorstep ? form.address.trim() : form.stopdeskLocation,
        stopDesk: !isDoorstep,
        amount: total,
        productSummary: itemLines,
        notes: form.notes.trim() || null,
      }).then(({ success: shipped, trackingNumber }) => {
        if (shipped && trackingNumber) {
          setConfirmedOrder((prev) => (prev ? { ...prev, trackingNumber } : prev));
        }
      });
    }
  };

  if (confirmedOrder) {
    const whatsappLink = buildWhatsAppLink(`Hi MNX! Following up on order ${confirmedOrder.orderNumber}.`);
    return (
      <section className="page">
        <div className="wrap checkout-wrap">
          <ConfirmScreen
            orderNumber={confirmedOrder.orderNumber}
            trackingNumber={confirmedOrder.trackingNumber}
            whatsappLink={whatsappLink}
            onBackToHome={() => setConfirmedOrder(null)}
          />
          {suggested.length > 0 && (
            <div className="checkout-suggested">
              <span className="eyebrow">Keep Exploring</span>
              <h2>You may also like</h2>
              <ProductGrid products={suggested} />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="wrap checkout-wrap">
        <span className="eyebrow">Almost There</span>
        <h1 className="shop-title" style={{ marginBottom: 44 }}>
          Checkout
        </h1>
        <div className="checkout-layout">
          <div>
            <CheckoutForm
              values={form}
              onChange={handleFieldChange}
              onSubmit={handleSubmit}
              submitting={submitting}
              wilayaOptions={deliveryPrices}
              wilayaLoading={deliveryLoading}
              communeOptions={communes}
              communesLoading={communesLoading}
              communesError={communesError}
            />
          </div>
          <OrderSummary
            lineItems={lineItems}
            subtotal={cartTotal}
            deliveryPrice={deliveryPrice}
            deliveryLabel={form.wilaya ? deliveryLabel : null}
          />
        </div>
      </div>
    </section>
  );
}
