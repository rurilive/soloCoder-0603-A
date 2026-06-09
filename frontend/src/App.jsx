import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import Header from './components/Header';
import Home from './pages/client/Home';
import HotelList from './pages/client/HotelList';
import HotelDetail from './pages/client/HotelDetail';
import BookingSuccess from './pages/client/BookingSuccess';
import OrderList from './pages/client/OrderList';
import OrderDetail from './pages/client/OrderDetail';

import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminHotelList from './pages/admin/AdminHotelList';
import AdminHotelForm from './pages/admin/AdminHotelForm';
import AdminRoomList from './pages/admin/AdminRoomList';
import AdminRoomForm from './pages/admin/AdminRoomForm';
import AdminOrderList from './pages/admin/AdminOrderList';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/hotels" element={<HotelList />} />
            <Route path="/hotels/:id" element={<HotelDetail />} />
            <Route path="/booking-success/:id" element={<BookingSuccess />} />
            <Route path="/orders" element={<OrderList />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/hotels" element={<AdminHotelList />} />
            <Route path="/admin/hotels/create" element={<AdminHotelForm />} />
            <Route path="/admin/hotels/:id/edit" element={<AdminHotelForm />} />
            <Route path="/admin/hotels/:id/rooms" element={<AdminRoomList />} />
            <Route path="/admin/hotels/:hotelId/rooms/create" element={<AdminRoomForm />} />
            <Route path="/admin/rooms/:id/edit" element={<AdminRoomForm />} />
            <Route path="/admin/orders" element={<AdminOrderList />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;