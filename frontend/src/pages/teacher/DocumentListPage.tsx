import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Space,
  Select,
  Modal,
  message,
  Tooltip,
  Row,
  Col,
  Empty,
} from 'antd'
import {
  UploadOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'
import {
  listDocuments,
  deleteDocument,
  approveDocument,
  processDocument,
  getCourses,
} from '../../services/documentsApi'
import type { DocumentInfo, CourseInfo } from '../../services/documentsApi'

const { Title, Text } = Typography

/* ── Design Tokens ────────────────────────────────────────────────── */
const colors = {
  navy: '#1a365d',
  navyLight: '#2b6cb0',
  slate: '#1e293b',
  slateMuted: '#475569',
  slateSubtle: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff',
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    color: colors.navy,
    margin: 0,
  },
  filterCard: {
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  filterRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  tableCard: {
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
}

/* ── Constants ────────────────────────────────────────────────────── */
const FILE_TYPE_OPTIONS = [
  { value: 'courseware', label: '课件' },
  { value: 'lab_guide', label: '实验指导' },
  { value: 'assignment', label: '作业' },
  { value: 'reference', label: '参考资料' },
  { value: 'other', label: '其他' },
]

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]

/* ── Helpers ──────────────────────────────────────────────────────── */
const FILE_TYPE_MAP: Record<string, { color: string; label: string }> = {
  courseware: { color: 'blue', label: '课件' },
  lab_guide: { color: 'cyan', label: '实验指导' },
  assignment: { color: 'orange', label: '作业' },
  reference: { color: 'purple', label: '参考资料' },
  other: { color: 'default', label: '其他' },
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  processing: { color: 'blue', label: '处理中' },
  completed: { color: 'green', label: '已完成' },
  failed: { color: 'red', label: '失败' },
  approved: { color: 'green', label: '已通过' },
  rejected: { color: 'red', label: '已驳回' },
}

const PROCESSING_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待处理' },
  processing: { color: 'blue', label: '解析中' },
  completed: { color: 'green', label: '已解析' },
  failed: { color: 'red', label: '解析失败' },
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ── Component ────────────────────────────────────────────────────── */
export default function DocumentListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  // Data
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [courses, setCourses] = useState<CourseInfo[]>([])

  // Filters
  const [courseId, setCourseId] = useState<number | undefined>()
  const [fileType, setFileType] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const isAdmin = user?.role === 'admin'

  /* ── 加载数据 ────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listDocuments({
        course_id: courseId,
        file_type: fileType,
        status,
        page,
        page_size: pageSize,
      })
      setDocuments(res.items)
      setTotal(res.total)
    } catch (err: any) {
      message.error(err.message || '加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }, [courseId, fileType, status, page, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* 加载课程列表 */
  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch(() => {})
  }, [])

  /* ── 筛选变化 ────────────────────────────────────────────────── */
  const handleFilterChange = (resetPage = true) => {
    if (resetPage) setPage(1)
  }

  /* ── 删除 ────────────────────────────────────────────────────── */
  const handleDelete = (doc: DocumentInfo) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除「${doc.title}」吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDocument(doc.id)
          message.success('删除成功')
          fetchData()
        } catch (err: any) {
          message.error(err.message || '删除失败')
        }
      },
    })
  }

  /* ── 审核 ────────────────────────────────────────────────────── */
  const handleApprove = async (id: number, status: 'approved' | 'rejected') => {
    const action = status === 'approved' ? '通过' : '驳回'
    Modal.confirm({
      title: `确认${action}`,
      content: `确定要${action}该文档吗？`,
      okText: action,
      cancelText: '取消',
      onOk: async () => {
        try {
          await approveDocument(id, { status, comment: '' })
          message.success(`文档已${action}`)
          fetchData()
        } catch (err: any) {
          message.error(err.message || `${action}失败`)
        }
      },
    })
  }

  /* ── 重新处理 ────────────────────────────────────────────────── */
  const handleReProcess = async (id: number) => {
    try {
      await processDocument(id)
      message.success('已重新触发文档处理')
      fetchData()
    } catch (err: any) {
      message.error(err.message || '处理失败')
    }
  }

  /* ── Table Columns ────────────────────────────────────────────── */
  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      ellipsis: true,
      render: (text: string) => (
        <Space>
          <FileTextOutlined style={{ color: colors.navyLight }} />
          <Tooltip title={text}>
            <span style={{ color: colors.slate }}>{text}</span>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (type: string) => {
        const info = FILE_TYPE_MAP[type] ?? { color: 'default', label: type }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '课程',
      dataIndex: 'course_name',
      key: 'course_name',
      width: 140,
      ellipsis: true,
      render: (name: string | null) => (
        <Text style={{ color: colors.slateMuted }}>
          {name ?? <span style={{ color: colors.slateSubtle }}>未关联</span>}
        </Text>
      ),
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 90,
      align: 'right' as const,
      render: (size: number) => (
        <Text style={{ color: colors.slateMuted }}>{formatFileSize(size)}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) => {
        const info = STATUS_MAP[s] ?? { color: 'default', label: s }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '处理状态',
      dataIndex: 'processing_status',
      key: 'processing_status',
      width: 90,
      render: (s: string) => {
        const info = PROCESSING_MAP[s] ?? { color: 'default', label: s }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => (
        <Text style={{ color: colors.slateSubtle, fontSize: 13 }}>
          {formatDate(date)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: isAdmin ? 220 : 120,
      fixed: 'right' as const,
      render: (_: unknown, record: DocumentInfo) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/teacher/documents?id=${record.id}`)}
            >
              详情
            </Button>
          </Tooltip>

          {(user?.id === record.uploader_id || isAdmin) && (
            <Tooltip title="删除文档">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record)}
              />
            </Tooltip>
          )}

          {isAdmin && record.status === 'pending' && (
            <>
              <Tooltip title="审核通过">
                <Button
                  type="link"
                  size="small"
                  style={{ color: '#16a34a' }}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleApprove(record.id, 'approved')}
                />
              </Tooltip>
              <Tooltip title="驳回">
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleApprove(record.id, 'rejected')}
                />
              </Tooltip>
            </>
          )}

          {record.status === 'failed' && (
            <Tooltip title="重新处理">
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => handleReProcess(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={styles.page}>
      {/* ═══ Header ═══════════════════════════════════════════════════ */}
      <div style={styles.headerRow}>
        <Title level={2} style={styles.title}>
          文档管理
        </Title>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={() => navigate('/teacher/documents/upload')}
          style={{
            background: colors.navy,
            borderColor: colors.navy,
          }}
        >
          上传资料
        </Button>
      </div>

      {/* ═══ Filter Bar ══════════════════════════════════════════════ */}
      <Card style={styles.filterCard} bordered={false} bodyStyle={{ padding: '16px 20px' }}>
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Text strong style={{ color: colors.slate, fontSize: 13, marginRight: 4 }}>
              课程
            </Text>
            <Select
              allowClear
              placeholder="全部课程"
              style={{ width: 160 }}
              value={courseId}
              onChange={(v) => {
                setCourseId(v)
                handleFilterChange()
              }}
              options={courses.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Col>
          <Col>
            <Text strong style={{ color: colors.slate, fontSize: 13, marginRight: 4 }}>
              类型
            </Text>
            <Select
              allowClear
              placeholder="全部类型"
              style={{ width: 120 }}
              value={fileType}
              onChange={(v) => {
                setFileType(v)
                handleFilterChange()
              }}
              options={FILE_TYPE_OPTIONS}
            />
          </Col>
          <Col>
            <Text strong style={{ color: colors.slate, fontSize: 13, marginRight: 4 }}>
              状态
            </Text>
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 120 }}
              value={status}
              onChange={(v) => {
                setStatus(v)
                handleFilterChange()
              }}
              options={STATUS_OPTIONS}
            />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Text style={{ color: colors.slateSubtle, fontSize: 13 }}>
              共 {total} 条记录
            </Text>
          </Col>
        </Row>
      </Card>

      {/* ═══ Table ═══════════════════════════════════════════════════ */}
      <Card style={styles.tableCard} bordered={false} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: (
              <Empty
                description="暂无文档"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => navigate('/teacher/documents/upload')}
                  style={{
                    background: colors.navy,
                    borderColor: colors.navy,
                  }}
                >
                  上传第一个文档
                </Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
        />
      </Card>
    </div>
  )
}
