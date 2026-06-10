import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'

const { Title } = Typography

export default function ChangePasswordPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, resetPassword, changePassword } = useAuthStore()

  const handleSubmit = async (values: { old_password?: string; new_password: string }) => {
    setLoading(true)
    try {
      if (user?.force_password_change) {
        await resetPassword(values.new_password)
        message.success('密码修改成功，请重新登录')
        navigate('/login')
      } else {
        await changePassword(values.old_password!, values.new_password)
        message.success('密码修改成功')
        navigate(`/${user?.role}`)
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3}>{user?.force_password_change ? '首次登录请修改密码' : '修改密码'}</Title>
        </div>
        <Form onFinish={handleSubmit} size="large">
          {!user?.force_password_change && (
            <Form.Item
              name="old_password"
              rules={[{ required: true, message: '请输入旧密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="旧密码" />
            </Form.Item>
          )}
          <Form.Item
            name="new_password"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="新密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
