import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Typography,
  Input,
  Button,
  Select,
  Card,
  Tag,
  Spin,
  Empty,
  Space,
  Divider,
  List,
  Tooltip,
  Alert,
  Row,
  Col,
} from 'antd'
import {
  SendOutlined,
  QuestionCircleOutlined,
  BookOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  UserOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  RightOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  askQuestion,
  getQAHistory,
  type QAResponse,
  type QAHistoryItem,
} from '../../services/searchApi'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    paddingBottom: 48,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    marginBottom: 4,
    fontWeight: 600,
  },
  headerSubtitle: {
    color: '#8c8c8c',
    fontSize: 14,
  },
  mainCol: {
    maxWidth: 780,
  },
  sideCol: {
    minWidth: 320,
  },

  // Input area
  inputCard: {
    borderRadius: 12,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    marginBottom: 20,
  },
  inputArea: {
    border: 'none',
    boxShadow: 'none',
    resize: 'none',
    fontSize: 15,
    padding: '12px 0',
  },
  inputFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTop: '1px solid #f0f0f0',
  } as CSSProperties,
  sendButton: {
    borderRadius: 8,
  },

  // Answer area
  answerCard: {
    borderRadius: 12,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    marginBottom: 16,
  } as CSSProperties,
  answerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  } as CSSProperties,
  answerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  } as CSSProperties,
  answerBody: {
    fontSize: 15,
    lineHeight: 1.8,
    color: '#262626',
    maxHeight: 600,
    overflowY: 'auto',
    padding: '0 4px',
  } as CSSProperties,
  latencyTag: {
    fontSize: 12,
    borderRadius: 4,
  },

  // Citations
  citationsTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#595959',
    marginBottom: 12,
    marginTop: 20,
  },
  citationCard: {
    borderRadius: 8,
    border: '1px solid #e8e8e8',
    marginBottom: 8,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  } as CSSProperties,
  citationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  } as CSSProperties,
  citationSnippet: {
    fontSize: 13,
    color: '#595959',
    lineHeight: 1.6,
    background: '#fafafa',
    padding: '8px 12px',
    borderRadius: 6,
    marginTop: 6,
  },

  // Rejected
  rejectedCard: {
    borderRadius: 12,
    marginBottom: 16,
  },

  // History sidebar
  sideCard: {
    borderRadius: 12,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    position: 'sticky',
    top: 24,
  } as CSSProperties,
  sideHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  } as CSSProperties,
  historyItem: {
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 4,
  } as CSSProperties,
  historyItemActive: {
    background: '#e6f4ff',
    border: '1px solid #91caff',
  },
  historyItemNormal: {
    background: '#fafafa',
    border: '1px solid transparent',
  },
  historyQuestion: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyDate: {
    fontSize: 11,
    color: '#bfbfbf',
  },

  // Loading skeleton
  loadingContainer: {
    textAlign: 'center',
    padding: '60px 0',
  } as CSSProperties,
  loadingText: {
    marginTop: 16,
    color: '#8c8c8c',
    fontSize: 14,
  },

  // QA Question bubble
  questionBubble: {
    background: '#f0f5ff',
    borderRadius: '12px 12px 4px 12px',
    padding: '12px 16px',
    marginBottom: 4,
    maxWidth: '90%',
    marginLeft: 'auto',
  } as CSSProperties,
  questionText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#1a1a2e',
  },
}

// ─── Markdown components override ───────────────────────────────────────────

const MarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <Paragraph style={{ marginBottom: 8, lineHeight: 1.8 }}>{children}</Paragraph>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ paddingLeft: 20, marginBottom: 8, lineHeight: 1.8 }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ paddingLeft: 20, marginBottom: 8, lineHeight: 1.8 }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: 2 }}>{children}</li>
  ),
  code: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          style={{
            background: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: '0.9em',
            color: '#d63384',
          }}
        >
          {children}
        </code>
      )
    }
    return (
      <pre
        style={{
          background: '#1e1e2e',
          color: '#cdd6f4',
          padding: '14px 16px',
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        <code>{children}</code>
      </pre>
    )
  },
  h1: ({ children }: { children?: React.ReactNode }) => (
    <Title level={3} style={{ marginTop: 16, marginBottom: 8 }}>
      {children}
    </Title>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <Title level={4} style={{ marginTop: 14, marginBottom: 6 }}>
      {children}
    </Title>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <Title level={5} style={{ marginTop: 12, marginBottom: 4 }}>
      {children}
    </Title>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      style={{
        borderLeft: '4px solid #1677ff',
        margin: '8px 0',
        padding: '8px 16px',
        background: '#f6f8fa',
        borderRadius: '0 6px 6px 0',
        color: '#595959',
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflow: 'auto', marginBottom: 12 }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          border: '1px solid #e8e8e8',
        }}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        border: '1px solid #e8e8e8',
        padding: '8px 12px',
        background: '#fafafa',
        fontWeight: 600,
        textAlign: 'left',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td
      style={{
        border: '1px solid #e8e8e8',
        padding: '8px 12px',
      }}
    >
      {children}
    </td>
  ),
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function QAPage() {
  const [searchParams] = useSearchParams()

  // Pre-fill question from URL param
  const questionFromUrl = searchParams.get('question') ?? ''

  const [question, setQuestion] = useState(questionFromUrl)
  const [courseId, setCourseId] = useState<string | undefined>(undefined)

  // Current QA result
  const [qaResult, setQaResult] = useState<QAResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // History
  const [history, setHistory] = useState<QAHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  // Ref for auto-scroll to answer
  const answerRef = useRef<HTMLDivElement>(null)

  // TODO: Week 2 - fetch courses from API
  const COURSES = [
    { value: '1', label: '大学物理' },
    { value: '2', label: '高等数学' },
    { value: '3', label: '程序设计' },
    { value: '4', label: '操作系统' },
    { value: '5', label: '数据结构' },
    { value: '6', label: '深度学习' },
    { value: '7', label: '软件工程' },
    { value: '8', label: '数字图像处理' },
    { value: '9', label: 'Unity开发' },
  ]

  // Load history on mount
  useEffect(() => {
    fetchHistory(1)
  }, [])

  // If URL has pre-filled question, send it automatically
  useEffect(() => {
    if (questionFromUrl) {
      handleAsk(questionFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── API calls ──────────────────────────────────────────────────────────

  const fetchHistory = async (pageNum: number) => {
    setHistoryLoading(true)
    try {
      const res = await getQAHistory({
        course_id: courseId,
        page: pageNum,
        page_size: 10,
      })
      setHistory((prev) => (pageNum === 1 ? res.items : [...prev, ...res.items]))
      setHistoryPage(pageNum)
    } catch {
      // Silently fail for history
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleAsk = async (q: string) => {
    if (!q.trim()) return
    setQuestion(q)
    setLoading(true)
    setError(null)
    setQaResult(null)
    setSelectedHistoryId(null)

    try {
      const res = await askQuestion({
        question: q.trim(),
        course_id: courseId,
      })
      setQaResult(res)

      // Refresh history
      fetchHistory(1)

      // Scroll to answer
      setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提问失败，请稍后重试'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleHistoryClick = (item: QAHistoryItem) => {
    setSelectedHistoryId(item.id)
    setQuestion(item.question)
    setQaResult({
      id: item.id,
      question: item.question,
      answer: item.answer,
      sources: item.sources,
      is_rejected: item.is_rejected,
      latency_ms: item.latency_ms,
    })
    setError(null)

    // Scroll to answer
    setTimeout(() => {
      answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleLoadMoreHistory = () => {
    fetchHistory(historyPage + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleAsk(question)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 60) return `${mins} 分钟前`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours} 小时前`
      const days = Math.floor(hours / 24)
      if (days < 7) return `${days} 天前`
      return date.toLocaleDateString('zh-CN')
    } catch {
      return dateStr
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <Title level={3} style={styles.headerTitle}>
          💬 AI 课程问答
        </Title>
        <Text style={styles.headerSubtitle}>
          基于课程资料智能问答，AI 回答将引用相关文档片段作为参考
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        {/* Main column */}
        <Col xs={24} lg={16}>
          {/* Question Input */}
          <Card style={styles.inputCard} bodyStyle={{ padding: '16px 20px' }}>
            <TextArea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题，例如：什么是进程调度？操作系统有哪些常见算法？"
              autoSize={{ minRows: 2, maxRows: 6 }}
              variant="borderless"
              style={styles.inputArea}
              disabled={loading}
            />
            <div style={styles.inputFooter}>
              <Space size={12}>
                <Select
                  allowClear
                  placeholder="全部课程"
                  value={courseId}
                  onChange={(value) => setCourseId(value)}
                  options={COURSES}
                  style={{ minWidth: 140 }}
                  size="small"
                  disabled={loading}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Ctrl+Enter 发送
                </Text>
              </Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleAsk(question)}
                loading={loading}
                disabled={!question.trim()}
                style={styles.sendButton}
              >
                发送
              </Button>
            </div>
          </Card>

          {/* Error state */}
          {error && (
            <Alert
              message="提问出错"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
              closable
              onClose={() => setError(null)}
            />
          )}

          {/* Loading state */}
          {loading && (
            <div style={styles.loadingContainer}>
              <Spin
                indicator={<LoadingOutlined style={{ fontSize: 40, color: '#1677ff' }} spin />}
              />
              <div style={styles.loadingText}>
                AI 正在思考中，请稍候...
              </div>
            </div>
          )}

          {/* Rejected state */}
          {!loading && qaResult?.is_rejected && (
            <Alert
              message="无法回答该问题"
              description={qaResult.answer || 'AI 无法基于现有课程资料回答该问题，请尝试换个问法。'}
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              style={{ ...styles.rejectedCard, borderRadius: 12 }}
            />
          )}

          {/* Answer display */}
          {!loading && qaResult && !qaResult.is_rejected && (
            <div ref={answerRef}>
              {/* Question bubble */}
              <div style={styles.questionBubble}>
                <Space style={{ marginBottom: 6 }}>
                  <UserOutlined style={{ color: '#1677ff' }} />
                  <Text strong style={{ fontSize: 12, color: '#1677ff' }}>
                    你的问题
                  </Text>
                </Space>
                <div style={styles.questionText}>{qaResult.question}</div>
              </div>

              {/* Answer card */}
              <Card
                style={styles.answerCard}
                bodyStyle={{ padding: '20px 24px' }}
              >
                <div style={styles.answerHeader}>
                  <Space>
                    <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                    <Text strong style={{ fontSize: 15 }}>
                      AI 回答
                    </Text>
                  </Space>
                  <div style={styles.answerMeta}>
                    <Tag icon={<ClockCircleOutlined />} style={styles.latencyTag}>
                      {(qaResult.latency_ms / 1000).toFixed(1)}s
                    </Tag>
                    <Tag
                      color="processing"
                      icon={<BookOutlined />}
                      style={styles.latencyTag}
                    >
                      {qaResult.sources.length} 个来源
                    </Tag>
                  </div>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <div style={styles.answerBody}>
                  <ReactMarkdown
                    components={MarkdownComponents}
                    remarkPlugins={[remarkGfm]}
                  >
                    {qaResult.answer}
                  </ReactMarkdown>
                </div>

                {/* Source citations */}
                {qaResult.sources.length > 0 && (
                  <>
                    <div style={styles.citationsTitle}>
                      <BookOutlined style={{ marginRight: 6 }} />
                      参考来源
                    </div>
                    {qaResult.sources.map((source, i) => (
                      <Card
                        key={source.chunk_id}
                        size="small"
                        style={{
                          ...styles.citationCard,
                          ...(i === 0 ? {} : {}),
                        }}
                        hoverable
                        bodyStyle={{ padding: '10px 14px' }}
                      >
                        <div style={styles.citationHeader}>
                          <Space>
                            <Tag color="blue" style={{ borderRadius: 4, margin: 0 }}>
                              来源 {i + 1}
                            </Tag>
                            <Text strong style={{ fontSize: 13 }}>
                              {source.title}
                            </Text>
                          </Space>
                          <Tooltip title={`匹配度: ${(source.score * 100).toFixed(0)}%`}>
                            <Tag
                              color={source.score > 0.7 ? 'success' : 'default'}
                              style={{ borderRadius: 4, margin: 0, fontSize: 11 }}
                            >
                              {(source.score * 100).toFixed(0)}%
                            </Tag>
                          </Tooltip>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          文档 ID: {source.document_id}
                        </Text>
                      </Card>
                    ))}
                  </>
                )}
              </Card>
            </div>
          )}

          {/* Empty state */}
          {!loading && !qaResult && !error && (
            <Card style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text type="secondary">在上方输入问题，AI 将基于课程资料为你解答</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      支持追问、对比分析、概念解释等各类学习问题
                    </Text>
                  </div>
                }
              />
            </Card>
          )}

          {/* Suggest questions when no result */}
          {!loading && !qaResult && !error && (
            <Card
              style={{
                marginTop: 16,
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.06)',
                background: '#fafafa',
              }}
              bodyStyle={{ padding: '16px 20px' }}
            >
              <Space style={{ marginBottom: 12 }}>
                <QuestionCircleOutlined style={{ color: '#1677ff' }} />
                <Text strong style={{ fontSize: 13 }}>
                  试试这些问题
                </Text>
              </Space>
              <List
                size="small"
                split={false}
                dataSource={[
                  '什么是进程调度？操作系统有哪些常见调度算法？',
                  '高等数学中导数的几何意义是什么？',
                  '数据结构中二叉树的遍历方式有哪些？',
                  '大学物理电磁学部分的核心概念是什么？',
                ]}
                renderItem={(item) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '4px 0' }}
                    onClick={() => handleAsk(item)}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 13 }}
                    >
                      <RightOutlined style={{ fontSize: 10, marginRight: 6 }} />
                      {item}
                    </Text>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>

        {/* Sidebar - QA History */}
        <Col xs={24} lg={8}>
          <Card
            style={styles.sideCard}
            bodyStyle={{
              padding: '16px 16px',
              maxHeight: 'calc(100vh - 200px)',
              overflowY: 'auto',
            }}
          >
            <div style={styles.sideHeader}>
              <HistoryOutlined style={{ fontSize: 16, color: '#1677ff' }} />
              <Text strong style={{ fontSize: 14 }}>
                问答历史
              </Text>
              <Tag style={{ marginLeft: 'auto', borderRadius: 4, fontSize: 11 }}>
                {history.length}
              </Tag>
            </div>

            <Divider style={{ margin: '8px 0 12px' }} />

            {history.length === 0 && !historyLoading && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text style={{ fontSize: 12 }}>暂无问答记录</Text>}
              />
            )}

            <List
              dataSource={history}
              split={false}
              renderItem={(item) => (
                <List.Item
                  style={{ padding: '2px 0', border: 'none' }}
                >
                  <div
                    style={{
                      ...styles.historyItem,
                      ...(selectedHistoryId === item.id
                        ? styles.historyItemActive
                        : styles.historyItemNormal),
                    }}
                    onClick={() => handleHistoryClick(item)}
                    onMouseEnter={(e) => {
                      if (selectedHistoryId !== item.id) {
                        e.currentTarget.style.background = '#f0f0f0'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedHistoryId !== item.id) {
                        e.currentTarget.style.background = '#fafafa'
                      }
                    }}
                  >
                    <div style={styles.historyQuestion}>
                      {item.is_rejected && (
                        <ExclamationCircleOutlined
                          style={{ color: '#faad14', marginRight: 4, fontSize: 11 }}
                        />
                      )}
                      {item.question}
                    </div>
                    <div style={styles.historyDate}>
                      <ClockCircleOutlined style={{ marginRight: 4, fontSize: 10 }} />
                      {formatDate(item.created_at)}
                      <Tag
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          borderRadius: 3,
                          lineHeight: '16px',
                        }}
                      >
                        {item.sources.length} 来源
                      </Tag>
                    </div>
                  </div>
                </List.Item>
              )}
            />

            {/* Load more */}
            {history.length > 0 && !historyLoading && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Button
                  type="link"
                  size="small"
                  onClick={handleLoadMoreHistory}
                  style={{ fontSize: 12 }}
                >
                  加载更多
                </Button>
              </div>
            )}

            {historyLoading && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <Spin size="small" />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
