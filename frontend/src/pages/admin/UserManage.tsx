import { useEffect, useState } from 'react'
import { Typography, Card, Table, Tag, Space, Button, Empty, message, Modal, Select } from 'antd'
import { StopOutlined, CheckCircleOutlined, KeyOutlined } from '@ant-design/icons'
import api from '../../services/api'
import type { APIResponse } from '../../types/api'

const { Title } = Typography

interface UserRecord {
  id: number
  username: string
  role: string
  real_name: string
  email: string | null
  is_active: boolean
  force_password_change: boolean
  created_at: string
}

interface PaginatedData {
  items: UserRecord[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export default function UserManage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<string | undefined>()

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params: Record<string, string|number> = { page_size: 100 }
      if (role) params.role = role
      const r = await api.get<APIResponse<PaginatedData>>('/admin/users', { params })
      if (r.data.code === 0 && r.data.data) {
        setUsers(r.data.data.items || [])
      }
    } catch { message.error('加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [role])

  const toggleActive = async (id: number) => {
    try {
      await api.put(`/admin/users/${id}/disable`)
      message.success('操作成功')
      fetchUsers()
    } catch { message.error('操作失败') }
  }

  const resetPassword = async (id: number) => {
    Modal.confirm({
      title: '重置密码',
      content: '确定重置该用户密码？',
      onOk: async () => {
        try {
          const r = await api.post<APIResponse<{ temp_password: string }>>(`/admin/users/${id}/reset-password`)
          if (r.data.code === 0) {
            Modal.success({ title: '密码已重置', content: `临时密码: ${r.data.data?.temp_password}` })
            fetchUsers()
          }
        } catch { message.error('操作失败') }
      },
    })
  }

  const roleMap: Record<string, { color: string; text: string }> = {
    admin: { color: 'red', text: '管理员' },
    teacher: { color: 'blue', text: '教师' },
    student: { color: 'green', text: '学生' },
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '姓名', dataIndex: 'real_name' },
    {
      title: '角色', dataIndex: 'role',
      render: (r: string) => {
        const item = roleMap[r] ?? { color: 'default', text: r }
        return <Tag color={item.color}>{item.text}</Tag>
      },
    },
    {
      title: '状态', dataIndex: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '正常' : '禁用'}</Tag>,
    },
    {
      title: '操作', key: 'action',
      render: (_: unknown, record: UserRecord) => (
        <Space>
          <Button size="small" icon={<KeyOutlined />} onClick={() => resetPassword(record.id)}>重置密码</Button>
          <Button size="small" danger={record.is_active} icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleActive(record.id)}>
            {record.is_active ? '禁用' : '启用'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>用户管理</Title>
      <Card style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Select allowClear placeholder="角色筛选" style={{ width: 120 }} onChange={(v) => setRole(v)} options={[
            { value: 'student', label: '学生' },
            { value: 'teacher', label: '教师' },
            { value: 'admin', label: '管理员' },
          ]} />
        </Space>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading}
          locale={{ emptyText: <Empty description="暂无用户" /> }} />
      </Card>
    </div>
  )
}
