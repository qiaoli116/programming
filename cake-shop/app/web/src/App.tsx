import { Navigate, Route, Routes } from 'react-router-dom';
import { Start } from './pages/Start';
import { OrderPage } from './pages/OrderPage';
import { BakerLogin, BakerShell } from './pages/Baker';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/order/new" replace />} />
      <Route path="/order/new" element={<Start />} />
      <Route path="/order/:id" element={<OrderPage />} />
      <Route path="/baker/login" element={<BakerLogin />} />
      <Route path="/baker/:id?" element={<BakerShell />} />
      <Route path="*" element={<Navigate to="/order/new" replace />} />
    </Routes>
  );
}
