import { useEffect, useState } from 'react'
import { Typography, Card, Row, Col, Statistic, List, Button, Space, Tag, Spin } from 'antd'
import {
  UserOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  AuditOutlined,
  ExclamationCircleOutlined,
  DashboardOutlined,
  TeamOutlined,
  ArrowRightOutlined,
  BookOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { refreshDashboard } from '../../services/refresh'
import type { APIResponse } from '../../types/api'

const { Title, Text } = Typography

interface DashboardData {
  total_users: number
  total_courses: number
  total_docs: number
  pending_docs: number
  total_qa: number
  today_qa: number
}

const makeStatCards = (d: DashboardData) => [
  {
    title: '用户总数',
    icon: <UserOutlined />,
    value: d.total_users,
    gradient: 'linear-gradient(135deg, #1a237e 0%, #3949ab 100%)',
    shadow: '0 4px 14px rgba(26, 35, 126, 0.3)',
  },
  {
    title: '课程总数',
    icon: <BookOutlined />,
    value: d.total_courses,
    gradient: 'linear-gradient(135deg, #2e7d32 0%, #43a047 100%)',
    shadow: '0 4px 14px rgba(46, 125, 50, 0.3)',
  },
  {
    title: '文档总数',
    icon: <FileOutlined />,
    value: d.total_docs,
    gradient: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)',
    shadow: '0 4px 14px rgba(0, 77, 64, 0.3)',
  },
  {
    title: '问答总量',
    icon: <QuestionCircleOutlined />,
    value: d.total_qa,
    gradient: 'linear-gradient(135deg, #e65100 0%, #ef6c00 100%)',
    shadow: '0 4px 14px rgba(230, 81, 0, 0.3)',
  },
  {
    title: '待审核',
    icon: <AuditOutlined />,
    value: d.pending_docs,
    gradient: 'linear-gradient(135deg, #b71c1c 0%, #c62828 100%)',
    shadow: '0 4px 14px rgba(183, 28, 28, 0.3)',
  },
  {
    title: '今日问答',
    icon: <QuestionCircleOutlined />,
    value: d.today_qa,
    gradient: 'linear-gradient(135deg, #6a1b9a 0%, #8e24aa 100%)',
    shadow: '0 4px 14px rgba(106, 27, 154, 0.3)',
  },
]

const QUICK_ACTIONS = [
  { label: '文档审核', icon: <AuditOutlined />, link: '/admin/review', primary: true },
  { label: '用户管理', icon: <TeamOutlined />, link: '/admin/users', primary: false },
  { label: '数据统计', icon: <DashboardOutlined />, link: '/admin/dashboard', primary: false },
]

const emptyData: DashboardData = {
  total_users: 0, total_courses: 0, total_docs: 0,
  pending_docs: 0, total_qa: 0, today_qa: 0,
}

export default function AdminHomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    api.get<APIResponse<DashboardData>>('/admin/dashboard')
      .then((r) => {
        if (r.data.code === 0 && r.data.data) {
          setData(r.data.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    return refreshDashboard.subscribe(fetchData)
  }, [])

  const cards = makeStatCards(data)

  const pendingItems = [
    {
      title: `${data.pending_docs} 份文档待审核`,
      desc: '新上传的课程资料需要管理员审核确认',
      link: data.pending_docs > 0 ? '/admin/review' : '',
      color: 'red' as const,
      tag: data.pending_docs > 0 ? '待处理' : '已清空',
    },
    {
      title: '查看操作日志',
      desc: '浏览近期管理后台操作记录与变更',
      link: '/admin/dashboard',
      color: 'blue' as const,
      tag: '日志',
    },
  ]

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        管理仪表盘
      </Title>

      <Spin spinning={loading}>
        {/* Stats Row */}
        <Row gutter={[16, 16]}>
          {cards.map((card) => (
            <Col xs={24} sm={12} lg={8} xl={4} key={card.title}>
              <Card
                hoverable
                style={{
                  background: card.gradient,
                  borderRadius: 10,
                  border: 'none',
                  boxShadow: card.shadow,
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = card.shadow.replace('0 4px', '0 8px')
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = card.shadow
                }}
              >
                <Statistic
                  title={
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500 }}>
                      {card.title}
                    </span>
                  }
                  value={card.value}
                  prefix={<span style={{ color: 'rgba(255,255,255,0.9)', marginRight: 6 }}>{card.icon}</span>}
                  styles={{ content: { color: '#fff', fontSize: 30, fontWeight: 700 } }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>

      {/* Bottom Section */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {/* Pending Items */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                <ExclamationCircleOutlined style={{ marginRight: 8, color: '#faad14' }} />
                待办事项
              </span>
            }
            style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <List
              itemLayout="horizontal"
              dataSource={pendingItems}
              renderItem={(item) => (
                <List.Item
                  style={{
                    padding: '14px 0',
                    cursor: item.link ? 'pointer' : 'default',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (item.link) e.currentTarget.style.opacity = '0.75'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}
                  actions={
                    item.link
                      ? [
                          <Button
                            key="action"
                            type="link"
                            size="small"
                            onClick={() => navigate(item.link)}
                            style={{ fontSize: 13 }}
                          >
                            处理 <ArrowRightOutlined />
                          </Button>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Tag color={item.color} style={{ marginTop: 2, borderRadius: 4 }}>
                        {item.tag}
                      </Tag>
                    }
                    title={<span style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</span>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* Quick Actions */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                <DashboardOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                快捷操作
              </span>
            }
            style={{ borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  type={action.primary ? 'primary' : 'default'}
                  icon={action.icon}
                  block
                  size="large"
                  onClick={() => navigate(action.link)}
                  style={{
                    height: 48,
                    fontSize: 15,
                    borderRadius: 8,
                    ...(action.primary
                      ? {
                          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                          border: 'none',
                          boxShadow: '0 2px 8px rgba(24,144,255,0.35)',
                        }
                      : {
                          borderColor: '#d9d9d9',
                        }),
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
