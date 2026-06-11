import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Header = () => {
  const { user, logout, isOrganizer } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link to="/" className="text-2xl font-bold hover:text-blue-200 transition">
              🎉 EventHub
            </Link>
            <nav className="hidden md:flex space-x-6">
              <Link to="/" className="hover:text-blue-200 transition">活动列表</Link>
              {isOrganizer() && (
                <Link to="/create-event" className="hover:text-blue-200 transition">创建活动</Link>
              )}
              {user && <Link to="/my-events" className="hover:text-blue-200 transition">我的活动</Link>}
              <Link to="/checkin" className="hover:text-blue-200 transition">签到</Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="hidden sm:inline">欢迎, {user.username}</span>
                <button
                  onClick={handleLogout}
                  className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition"
                >
                  退出登录
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-blue-200 transition">登录</Link>
                <Link to="/register" className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;