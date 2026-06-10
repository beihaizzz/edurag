import { useEffect, useState, useCallback } from 'react'
import { Typography, Card, Row, Col, Statistic, Button, Table, Tag, Space, Empty, Spin } from 'antd'
import {
  FileOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  UploadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getDocumentStatistics,
  listDocuments,
  type DocumentInfo,
  type DocumentStatistics,
} from '../../services/documentsApi'
import { refreshDashboard } from '../../services/refresh'

const { Title } = Typography

/* ── Design Tokens (Academic Palette) ──────────────────────────── */
const tokens = {
  navy: '#1a365d',
  navyLight: '#2b6cb0',
  amber: '#d97706',
  emerald: '#059669',
  slate: '#1e293b',
  slateMuted: '#475569',
  slateSubtle: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff',
}

/* ── Table Columns ─────────────────────────────────────────────── */
const columns = [
  {
    title: '文件名',
    dataIndex: 'title',
    key: 'title',
    ellipsis: true,
  },
  {
    title: '类型',
    dataIndex: 'file_type',
    key: 'file_type',
    width: 100,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100,
    render: (status: string) => {
      const statusMap: Record<string, { color: string; text: string }> = {
        pending: { color: 'orange', text: '待审核' },
        approved: { color: 'green', text: '审核通过' },
        rejected: { color: 'red', text: '已驳回' },
      }
      const item = statusMap[status] ?? { color: 'default', text: status }
      return <Tag color={item.color}>{item.text}</Tag>
    },
  },
  {
    title: '上传时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180,
    render: (val: string) => {
      const d = new Date(val)
      return isNaN(d.getTime()) ? val : d.toLocaleString('zh-CN')
    },
  },
]

export default function TeacherHomePage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DocumentStatistics | null>(null)
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, docsRes] = await Promise.all([
        getDocumentStatistics(),
        listDocuments({ page: 1, page_size: 5 }),
      ])
      setStats(statsRes)
      setDocuments(docsRes.items)
    } catch {
      // silently fail, initial data already 0
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    return refreshDashboard.subscribe(fetchData)
  }, [fetchData])

  const s = stats ?? { total: 0, pending: 0, approved: 0, rejected: 0, processing: 0, failed: 0 }

  const statCards = [
    { title: '已上传文档数', value: s.total, icon: <FileOutlined />, accent: tokens.navyLight, gradient: 'linear-gradient(135deg, #ebf4ff 0%, #dbeafe 100%)' },
    { title: '待审核数', value: s.pending, icon: <ClockCircleOutlined />, accent: tokens.amber, gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' },
    { title: '审核通过数', value: s.approved, icon: <CheckCircleOutlined />, accent: tokens.emerald, gradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' },
  ]

  return (
    <div>
      <Title level={2} style={{ color: tokens.navy, marginBottom: 0 }}>
        教师工作台
      </Title>

      {/* ═══ Statistics Cards ═══ */}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {statCards.map((card) => (
            <Col xs={24} sm={12} lg={8} key={card.title}>
              <Card
                style={{
                  background: card.gradient,
                  borderLeft: `4px solid ${card.accent}`,
                  borderRadius: 10,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <Statistic
                  title={<span style={{ color: tokens.slateMuted, fontSize: 14 }}>{card.title}</span>}
                  value={card.value}
                  prefix={<span style={{ color: card.accent, marginRight: 8, fontSize: 20 }}>{card.icon}</span>}
                  styles={{ content: { color: tokens.slate, fontWeight: 700, fontSize: 28 } }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>

      {/* ═══ Quick Actions ═══ */}
      <Card style={{ marginTop: 16, borderRadius: 10, border: `1px solid ${tokens.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: tokens.navy, fontWeight: 600, fontSize: 16 }}>快捷操作</span>
          <Space size="middle">
            <Button
              type="primary"
              icon={<UploadOutlined />}
              size="large"
              onClick={() => navigate('/teacher/documents/upload')}
              style={{
                background: tokens.navy,
                borderColor: tokens.navy,
                borderRadius: 8,
                height: 44,
                paddingInline: 28,
                fontSize: 15,
                boxShadow: '0 2px 6px rgba(26,54,93,0.2)',
              }}
            >
              上传文档
            </Button>
            <Button
              icon={<FileTextOutlined />}
              size="large"
              onClick={() => navigate('/teacher/documents')}
              style={{
                borderRadius: 8,
                height: 44,
                paddingInline: 28,
                fontSize: 15,
                borderColor: tokens.navyLight,
                color: tokens.navyLight,
              }}
            >
              文档管理
            </Button>
          </Space>
        </div>
      </Card>

      {/* ═══ Recent Uploads Table ═══ */}
      <Card style={{ marginTop: 16, borderRadius: 10, border: `1px solid ${tokens.border}` }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ color: tokens.navy, fontWeight: 600, fontSize: 16 }}>最近上传</span>
        </div>
        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          locale={{ emptyText: <Empty description="暂无上传文档" /> }}
          pagination={false}
          loading={loading}
        />
      </Card>
    </div>
  )
}
