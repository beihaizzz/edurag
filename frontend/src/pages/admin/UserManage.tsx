import { Typography, Card, Table, Tag, Space, Button, Empty } from 'antd'
import { LockOutlined, UnlockOutlined, KeyOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function UserManage() {
  const columns = [
    { title: '学号/工号', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'real_name', key: 'real_name' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const map: Record<string, { color: string; text: string }> = {
          student: { color: 'blue', text: '学生' },
          teacher: { color: 'green', text: '教师' },
          admin: { color: 'red', text: '管理员' },
        }
        return <Tag color={map[role]?.color}>{map[role]?.text ?? role}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '正常' : '已禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button type="link" icon={<KeyOutlined />}>重置密码</Button>
          <Button type="link" icon={<UnlockOutlined />}>启用</Button>
          <Button type="link" danger icon={<LockOutlined />}>禁用</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>用户管理</Title>
      <Card style={{ marginTop: 16 }}>
        <Table columns={columns} dataSource={[]} rowKey="id" locale={{ emptyText: <Empty description="暂无用户数据" /> }} />
      </Card>
    </div>
  )
}
