import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout as AntLayout, Menu, Button, Typography, Space, Dropdown } from 'antd'
import {
  HomeOutlined,
  LogoutOutlined,
  UserOutlined,
  KeyOutlined,
  SearchOutlined,
  MessageOutlined,
  UploadOutlined,
  FileOutlined,
  DashboardOutlined,
  AuditOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'

const { Header, Sider, Content } = AntLayout
const { Text } = Typography

const menuMap: Record<string, { key: string; icon: React.ReactNode; label: string }[]> = {
  student: [
    { key: '/student', icon: <HomeOutlined />, label: '首页检索' },
    { key: '/student/search', icon: <SearchOutlined />, label: '搜索结果' },
    { key: '/student/qa', icon: <MessageOutlined />, label: '问答历史' },
  ],
  teacher: [
    { key: '/teacher', icon: <HomeOutlined />, label: '首页' },
    { key: '/teacher/documents/upload', icon: <UploadOutlined />, label: '上传文档' },
    { key: '/teacher/documents', icon: <FileOutlined />, label: '文档管理' },
  ],
  admin: [
    { key: '/admin', icon: <HomeOutlined />, label: '仪表盘' },
    { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '数据统计' },
    { key: '/admin/review', icon: <AuditOutlined />, label: '文档审核' },
    { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
  ],
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const role = user?.role ?? 'student'
  const items = menuMap[role] ?? []

  // 高亮当前路由（匹配前缀）
  const selectedKey = items.find(
    (item) => location.pathname.startsWith(item.key),
  )?.key ?? items[0]?.key

  const dropdownItems = [
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => navigate('/change-password'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      danger: true,
      label: '退出登录',
      onClick: () => {
        logout()
        navigate('/login')
      },
    },
  ]

  const roleLabel: Record<string, string> = {
    admin: '管理员',
    teacher: '教师',
    student: '学生',
  }

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => navigate(`/${role}`)}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
            EduRAG
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Space>
            <Text type="secondary">
              {(user?.real_name || user?.username)}（{roleLabel[role] ?? role}）
            </Text>
            <Dropdown menu={{ items: dropdownItems }}>
              <Button icon={<UserOutlined />} shape="circle" />
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  )
}
