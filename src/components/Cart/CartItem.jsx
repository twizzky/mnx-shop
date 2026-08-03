import { fmt, productImages } from '../../utils/format';
import QtyStepper from '../UI/QtyStepper';
import './CartItem.css';

export default function CartItem({ product, qty, lineTotal, onChangeQty, onRemove }) {
  const [thumbnail] = productImages(product, 200);

  return (
    <div className="cart-item">
      <div className="ci-img">
        <img src={thumbnail} alt={product.name} />
      </div>
      <div>
        <div className="ci-name">{product.name}</div>
        <div className="ci-cat">{product.cat}</div>
        <QtyStepper
          value={qty}
          size="sm"
          onDecrement={() => onChangeQty(product.id, -1)}
          onIncrement={() => onChangeQty(product.id, 1)}
        />
      </div>
      <div className="ci-right">
        <div className="ci-total">{fmt(lineTotal)}</div>
        <button type="button" className="ci-remove" onClick={() => onRemove(product.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}
