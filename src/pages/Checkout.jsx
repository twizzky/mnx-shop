import { useMemo, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import { useDelivery } from '../hooks/useDelivery';
import { submitOrder as submitOrderRequest } from '../services/api';
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

const INITIAL_FORM = { name: '', phone: '', wilaya: '', deliveryMethod: DELIVERY_METHODS[0].value };

export default function Checkout() {
  const { lineItems, cartTotal, clearCart } = useCart();
  const { showToast } = useToast();
  const { deliveryPrices, loading: deliveryLoading, findPrice } = useDelivery();

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null); // { orderNumber } | null

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

  const handleSubmit = async () => {
    if (!lineItems.length) {
      showToast('Your cart is empty');
      return;
    }
    if (!form.name.trim() || !form.phone.trim() || !form.wilaya) {
      showToast('Please fill in every field');
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

    const { success } = await submitOrderRequest({
      orderNumber,
      name: form.name.trim(),
      phone: form.phone.trim(),
      wilaya: form.wilaya,
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

    setConfirmedOrder({ orderNumber });
    clearCart();
    setForm(INITIAL_FORM);
  };

  if (confirmedOrder) {
    const whatsappLink = buildWhatsAppLink(`Hi MNX! Following up on order ${confirmedOrder.orderNumber}.`);
    return (
      <section className="page">
        <div className="wrap checkout-wrap">
          <ConfirmScreen
            orderNumber={confirmedOrder.orderNumber}
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
