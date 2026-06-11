import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Dropdown, Button } from 'antd';
import { ApartmentOutlined, SearchOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';

function Header() {
  const location = useLocation();
  const [searchText, setSearchText] = useState('');
  
  const isAdmin = location.pathname.startsWith('/admin');
  
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchText.trim()) {
      window.location.href = `/hotels?search=${encodeURIComponent(searchText)}`;
    }
  };
  
  const userMenu = (
    <Menu>
      <Menu.Item key="1">
        <Link to="/orders">我的订单</Link>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="2">
        <Link to="/admin/login">管理后台</Link>
      </Menu.Item>
    </Menu>
  );

  const adminMenu = (
    <Menu>
      <Menu.Item key="1">
        <Link to="/admin/dashboard">仪表盘</Link>
      </Menu.Item>
      <Menu.Item key="2">
        <Link to="/admin/hotels">酒店管理</Link>
      </Menu.Item>
      <Menu.Item key="3">
        <Link to="/admin/orders">订单管理</Link>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="4">
        <Link to="/">返回首页</Link>
      </Menu.Item>
    </Menu>
  );

  if (isAdmin) {
    return (
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ApartmentOutlined className="text-2xl" />
              <h1 className="text-xl font-bold">
                <Link to="/admin/dashboard">酒店预订系统 - 管理后台</Link>
              </h1>
            </div>
            <Dropdown overlay={adminMenu} trigger={['click']}>
              <Button type="text" className="text-white hover:bg-blue-700">
                菜单 <UserOutlined />
              </Button>
            </Dropdown>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ApartmentOutlined className="text-2xl" />
            <h1 className="text-xl font-bold">
              <Link to="/">酒店预订系统</Link>
            </h1>
          </div>
          
          <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-8">
            <div className="flex items-center bg-white rounded-lg">
              <SearchOutlined className="text-gray-400 ml-3" />
              <input
                type="text"
                placeholder="搜索酒店名称、城市..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="flex-1 px-3 py-2 text-gray-800 outline-none"
              />
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-r-lg"
              >
                搜索
              </button>
            </div>
          </form>
          
          <Dropdown overlay={userMenu} trigger={['click']}>
            <Button type="text" className="text-white hover:bg-blue-700">
              <User className="mr-2" />
              我的账户
            </Button>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}

export default Header;