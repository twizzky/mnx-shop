import { Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { ProductsProvider } from './context/ProductsContext';
import { DeliveryProvider } from './context/DeliveryContext';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import Toast from './components/UI/Toast';
import ScrollToTop from './components/UI/ScrollToTop';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetails from './pages/ProductDetails';
import Search from './pages/Search';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import DeliveryPrices from './pages/DeliveryPrices';
import AdminImages from './pages/AdminImages';

/** The customer-facing site, wrapped in its own navbar/footer/transition. */
function Storefront() {
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Products />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/search" element={<Search />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/delivery-prices" element={<DeliveryPrices />} />
      </Routes>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <ProductsProvider>
      <DeliveryProvider>
        <CartProvider>
          <ToastProvider>
            {/* /admin is unlisted and renders bare — no nav, no footer, no
                link back into the shop. Everything else falls through to
                the storefront. */}
            <Routes>
              <Route path="/admin" element={<AdminImages />} />
              <Route path="*" element={<Storefront />} />
            </Routes>
            <Toast />
          </ToastProvider>
        </CartProvider>
      </DeliveryProvider>
    </ProductsProvider>
  );
}
