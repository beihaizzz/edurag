import { useEffect, useState } from 'react'
import { Typography, Card, Row, Col, Statistic, Spin } from 'antd'
import {
  UserOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  AuditOutlined,
  BookOutlined,
} from '@ant-design/icons'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import type { APIResponse } from '../../types/api'

const { Title } = Typography

interface DashboardData {
  total_users: number
  total_courses: number
  total_docs: number
  pending_docs: number
  total_qa: number
  today_qa: number
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    api.get<APIResponse<DashboardData>>('/admin/dashboard')
      .then((r) => {
        console.log('[Dashboard] API response:', r.data)
        if (r.data.code === 0 && r.data.data) {
          setData(r.data.data)
        }
      })
      .catch((e) => {
        console.error('[Dashboard] API failed:', e)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    console.log('[Dashboard] mounted, calling fetchData')
    fetchData()
    return refreshDashboard.subscribe(fetchData)
  }, [])

  const d = data ?? { total_users: 0, total_courses: 0, total_docs: 0, pending_docs: 0, total_qa: 0, today_qa: 0 }

  return (
    <div>
      <Title level={2}>数据统计</Title>
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} lg={8}>
            <Card><Statistic title="用户总数" value={d.total_users} prefix={<UserOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card><Statistic title="课程总数" value={d.total_courses} prefix={<BookOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card><Statistic title="文档总数" value={d.total_docs} prefix={<FileOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card>
              <Statistic title="待审核" value={d.pending_docs} prefix={<AuditOutlined />}
                styles={{ content: { color: d.pending_docs > 0 ? '#faad14' : undefined } }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card><Statistic title="问答总量" value={d.total_qa} prefix={<QuestionCircleOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card><Statistic title="今日问答" value={d.today_qa} prefix={<QuestionCircleOutlined />} /></Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}
