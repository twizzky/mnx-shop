import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import CartItem from '../components/Cart/CartItem';
import CartSummary from '../components/Cart/CartSummary';
import EmptyCart from '../components/Cart/EmptyCart';
import './Cart.css';

export default function Cart() {
  const { lineItems, cartTotal, changeQty, removeItem } = useCart();
  const { showToast } = useToast();

  const handleRemove = (productId) => {
    removeItem(productId);
    showToast('Item removed');
  };

  return (
    <section className="page">
      <div className="wrap cart-wrap">
        <span className="eyebrow">Your Selection</span>
        <h1 className="shop-title" style={{ marginBottom: 44 }}>
          Cart
        </h1>

        {lineItems.length === 0 ? (
          <EmptyCart />
        ) : (
          <div className="cart-layout">
            <div>
              {lineItems.map(({ product, qty, lineTotal }) => (
                <CartItem
                  key={product.id}
                  product={product}
                  qty={qty}
                  lineTotal={lineTotal}
                  onChangeQty={changeQty}
                  onRemove={handleRemove}
                />
              ))}
            </div>
            <CartSummary total={cartTotal} />
          </div>
        )}
      </div>
    </section>
  );
}
