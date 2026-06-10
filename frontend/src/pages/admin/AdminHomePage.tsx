import { Typography, Card, Row, Col, Statistic, List, Button, Space, Tag } from 'antd'
import {
  UserOutlined,
  FileOutlined,
  QuestionCircleOutlined,
  AuditOutlined,
  ExclamationCircleOutlined,
  DashboardOutlined,
  TeamOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

// TODO: Week 2 - fetch stats from /api/v1/admin/stats
const STAT_CARDS = [
  {
    title: '用户总数',
    icon: <UserOutlined />,
    gradient: 'linear-gradient(135deg, #1a237e 0%, #3949ab 100%)',
    shadow: '0 4px 14px rgba(26, 35, 126, 0.3)',
  },
  {
    title: '文档总数',
    icon: <FileOutlined />,
    gradient: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)',
    shadow: '0 4px 14px rgba(0, 77, 64, 0.3)',
  },
  {
    title: '问答总量',
    icon: <QuestionCircleOutlined />,
    gradient: 'linear-gradient(135deg, #e65100 0%, #ef6c00 100%)',
    shadow: '0 4px 14px rgba(230, 81, 0, 0.3)',
  },
  {
    title: '待审核',
    icon: <AuditOutlined />,
    gradient: 'linear-gradient(135deg, #b71c1c 0%, #c62828 100%)',
    shadow: '0 4px 14px rgba(183, 28, 28, 0.3)',
  },
]

// TODO: Week 2 - replace placeholder counts with API data
const PENDING_ITEMS = [
  {
    title: '12 份文档待审核',
    desc: '新上传的课程资料需要管理员审核确认',
    link: '/admin/review',
    color: 'red',
    tag: '紧急',
  },
  {
    title: '5 个用户反馈待处理',
    desc: '用户提交的问题反馈等待回复',
    link: '',
    color: 'orange',
    tag: '反馈',
  },
  {
    title: '查看操作日志',
    desc: '浏览近期管理后台操作记录与变更',
    link: '/admin/dashboard',
    color: 'blue',
    tag: '日志',
  },
]

const QUICK_ACTIONS = [
  {
    label: '文档审核',
    icon: <AuditOutlined />,
    link: '/admin/review',
    primary: true,
  },
  {
    label: '用户管理',
    icon: <TeamOutlined />,
    link: '/admin/users',
    primary: false,
  },
  {
    label: '数据统计',
    icon: <DashboardOutlined />,
    link: '/admin/dashboard',
    primary: false,
  },
]

export default function AdminHomePage() {
  const navigate = useNavigate()

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        管理仪表盘
      </Title>

      {/* Stats Row */}
      <Row gutter={[16, 16]}>
        {STAT_CARDS.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
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
                value={0}
                prefix={<span style={{ color: 'rgba(255,255,255,0.9)', marginRight: 6 }}>{card.icon}</span>}
                valueStyle={{ color: '#fff', fontSize: 30, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

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
              dataSource={PENDING_ITEMS}
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
