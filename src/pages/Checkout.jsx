import { useMemo, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { useDelivery } from '../hooks/useDelivery';
import { submitOrder as submitOrderRequest } from '../services/api';
import { createShipment } from '../services/ecotrackApi';
import { fmt } from '../utils/format';
import { buildWhatsAppLink, DELIVERY_METHODS } from '../utils/constants';
import CheckoutForm from '../components/Checkout/CheckoutForm';
import OrderSummary from '../components/Checkout/OrderSummary';
import ConfirmScreen from '../components/Checkout/ConfirmScreen';
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
};

export default function Checkout() {
  const { lineItems, cartTotal, clearCart } = useCart();
  const { showToast } = useToast();
  const { deliveryPrices, loading: deliveryLoading, findPrice } = useDelivery();

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null); // { orderNumber, trackingNumber } | null

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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

  const handleSubmit = async () => {
    if (!lineItems.length) {
      showToast('Your cart is empty');
      return;
    }
    if (!form.name.trim() || !form.phone.trim() || !form.wilaya || !form.commune.trim()) {
      showToast('Please fill in every field');
      return;
    }
    if (isDoorstep && !form.address.trim()) {
      showToast('Please add a street address for doorstep delivery');
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
    // of what happens here. If Ecotrack isn't configured yet, or the
    // courier's system is briefly unavailable, the customer still sees
    // a normal confirmation — you can always create the shipment
    // manually from your courier's dashboard using the order details.
    if (orderId) {
      const wilayaRow = deliveryPrices.find((d) => d.wilaya === form.wilaya);
      createShipment({
        orderId,
        orderNumber,
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        wilaya: form.wilaya,
        wilayaCode: wilayaRow?.wilaya_code,
        commune: form.commune.trim(),
        address: isDoorstep ? form.address.trim() : null,
        stopDesk: !isDoorstep,
        amount: total,
        productSummary: itemLines,
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
