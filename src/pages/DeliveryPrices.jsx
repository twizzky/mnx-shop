import { useDelivery } from '../hooks/useDelivery';
import { fmt } from '../utils/format';
import './DeliveryPrices.css';

export default function DeliveryPrices() {
  const { deliveryPrices, loading } = useDelivery();

  return (
    <section className="page">
      <div className="wrap delivery-head">
        <span className="eyebrow">Shipping Info</span>
        <h1 className="shop-title">Delivery Prices</h1>
        <p className="delivery-intro">
          Rates below apply per wilaya. You'll choose doorstep or stopdesk delivery at checkout, and the total
          updates automatically.
        </p>
      </div>

      <div className="wrap delivery-body">
        {loading && <p className="search-status">Loading delivery prices…</p>}

        {!loading && deliveryPrices.length === 0 && (
          <p className="empty-note">Delivery pricing hasn't been set up yet — check back soon.</p>
        )}

        {!loading && deliveryPrices.length > 0 && (
          <div className="delivery-table-wrap">
            <table className="delivery-table">
              <thead>
                <tr>
                  <th>Wilaya</th>
                  <th>Doorstep Delivery</th>
                  <th>Stopdesk Delivery</th>
                </tr>
              </thead>
              <tbody>
                {deliveryPrices.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Wilaya">{row.wilaya}</td>
                    <td data-label="Doorstep Delivery">{fmt(row.home_delivery_price)}</td>
                    <td data-label="Stopdesk Delivery">{fmt(row.stopdesk_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
