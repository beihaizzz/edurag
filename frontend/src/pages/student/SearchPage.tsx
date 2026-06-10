import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Typography,
  Input,
  Radio,
  Select,
  Card,
  Tag,
  Pagination,
  Empty,
  Spin,
  Button,
  Divider,
  Alert,
} from 'antd'
import {
  SearchOutlined,
  FileTextOutlined,
  BookOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { search, type SearchResultItem, type SearchParams } from '../../services/searchApi'

const { Title, Text } = Typography

// ─── Highlight matching text ────────────────────────────────────────────────

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={styles.highlight}>{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

// ─── File type tag color map ────────────────────────────────────────────────

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: '#f5222d',
  doc: '#1677ff',
  docx: '#1677ff',
  ppt: '#fa8c16',
  pptx: '#fa8c16',
  txt: '#52c41a',
  md: '#13c2c2',
  default: '#8c8c8c',
}

function fileTypeTag(type: string): React.ReactNode {
  const color = FILE_TYPE_COLORS[type.toLowerCase()] ?? FILE_TYPE_COLORS.default
  return (
    <Tag color={color} style={{ borderRadius: 4, margin: 0 }}>
      {type.toUpperCase()}
    </Tag>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    paddingBottom: 48,
  },
  heroSearch: {
    background: 'linear-gradient(135deg, #0f1b2d 0%, #1a3a4a 50%, #0d5e6e 100%)',
    borderRadius: 16,
    padding: '40px 36px 32px',
    marginBottom: 24,
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute',
    inset: 0,
    opacity: 0.05,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
  },
  heroTitle: {
    color: '#ffffff',
    marginBottom: 6,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 15,
    marginBottom: 28,
  },
  searchInput: {
    maxWidth: 640,
    margin: '0 auto',
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 24,
    padding: '0 4px',
  } as CSSProperties,
  filterLabel: {
    fontSize: 13,
    color: '#8c8c8c',
    whiteSpace: 'nowrap',
  },
  resultCard: {
    borderRadius: 10,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    marginBottom: 12,
    cursor: 'default',
  } as CSSProperties,
  resultTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
    color: '#1a1a2e',
  },
  resultMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 10,
  } as CSSProperties,
  snippetBox: {
    background: '#f9fafb',
    borderRadius: 8,
    padding: '10px 14px',
    marginTop: 6,
    borderLeft: '3px solid #1677ff',
    fontSize: 14,
    lineHeight: 1.7,
    color: '#434343',
    position: 'relative',
  } as CSSProperties,
  snippetScore: {
    position: 'absolute',
    top: 6,
    right: 8,
    fontSize: 11,
    color: '#8c8c8c',
  },
  highlight: {
    background: '#fff7b0',
    color: '#1a1a2e',
    borderRadius: 2,
    padding: '0 2px',
  },
  resultActions: {
    marginTop: 10,
    display: 'flex',
    justifyContent: 'flex-end',
  } as CSSProperties,
  paginationWrap: {
    textAlign: 'center',
    marginTop: 28,
  },
  summaryText: {
    textAlign: 'center',
    color: '#8c8c8c',
    fontSize: 13,
    marginBottom: 20,
  },
  emptyWrap: {
    padding: '80px 0',
    textAlign: 'center',
  } as CSSProperties,
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // State from URL
  const queryFromUrl = searchParams.get('q') ?? ''
  const modeFromUrl = (searchParams.get('mode') as SearchParams['mode']) ?? undefined

  // Local state
  const [query, setQuery] = useState(queryFromUrl)
  const [mode, setMode] = useState<SearchParams['mode']>(modeFromUrl ?? 'keyword')
  const [courseId, setCourseId] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)

  const [results, setResults] = useState<SearchResultItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Sync URL -> state on mount
  useEffect(() => {
    if (queryFromUrl) {
      setQuery(queryFromUrl)
      performSearch(queryFromUrl, modeFromUrl ?? 'keyword', undefined, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const performSearch = useCallback(
    async (
      q: string,
      m: SearchParams['mode'],
      cId?: string,
      p: number = 1,
    ) => {
      if (!q.trim()) return
      setLoading(true)
      setError(null)
      setSearched(true)

      try {
        const res = await search({
          q: q.trim(),
          mode: m,
          course_id: cId,
          page: p,
          page_size: pageSize,
        })
        setResults(res.results)
        setTotal(res.total)
        setTotalPages(res.total_pages)
        setPage(res.page)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '搜索请求失败，请稍后重试'
        setError(msg)
        setResults([])
        setTotal(0)
        setTotalPages(0)
      } finally {
        setLoading(false)
      }
    },
    [pageSize],
  )

  const handleSearch = (value: string) => {
    if (!value.trim()) return
    setQuery(value)
    setSearchParams({ q: value, mode: mode ?? '' })
    performSearch(value, mode, courseId, 1)
  }

  const handleModeChange = (m: SearchParams['mode']) => {
    setMode(m)
    if (query.trim()) {
      performSearch(query, m, courseId, 1)
    }
  }

  const handleCourseChange = (value: string | undefined) => {
    setCourseId(value)
    if (query.trim()) {
      performSearch(query, mode, value, 1)
    }
  }

  const handlePageChange = (p: number) => {
    setPage(p)
    performSearch(query, mode, courseId, p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToQA = (q: string) => {
    navigate(`/qa?question=${encodeURIComponent(q)}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Hero Search */}
      <div style={styles.heroSearch}>
        <div style={styles.heroDecor} />
        <div style={styles.heroContent}>
          <Title level={2} style={styles.heroTitle}>
            📚 课程资料搜索
          </Title>
          <Text style={styles.heroSubtitle}>
            输入关键词，快速定位课程文档中的相关内容
          </Text>
          <div style={styles.searchInput}>
            <Input.Search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onSearch={handleSearch}
              placeholder="搜索课程资料、课件、实验报告..."
              enterButton={
                <span>
                  <SearchOutlined /> 搜索
                </span>
              }
              size="large"
              loading={loading}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <Text style={styles.filterLabel}>检索模式：</Text>
        <Radio.Group
          value={mode}
          onChange={(e) => handleModeChange(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="keyword">关键词检索</Radio.Button>
          <Radio.Button value="semantic">语义检索</Radio.Button>
          <Radio.Button value="hybrid">混合检索</Radio.Button>
        </Radio.Group>

        <Divider type="vertical" style={{ height: 24 }} />

        <Text style={styles.filterLabel}>课程筛选：</Text>
        <Select
          allowClear
          placeholder="全部课程"
          value={courseId}
          onChange={handleCourseChange}
          options={COURSES}
          style={{ minWidth: 160 }}
          size="small"
        />
      </div>

      {/* Search Results */}
      {error && (
        <Alert
          message="搜索出错"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#8c8c8c' }}>正在搜索...</div>
        </div>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <div style={styles.emptyWrap}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                未找到与 <Text strong>"{query}"</Text> 相关的结果
              </span>
            }
          >
            <Text type="secondary">请尝试更换关键词或检索模式</Text>
          </Empty>
        </div>
      )}

      {!searched && !loading && (
        <div style={styles.emptyWrap}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请输入关键词搜索课程资料"
          />
        </div>
      )}

      {searched && !loading && results.length > 0 && (
        <>
          <Text style={styles.summaryText}>
            共找到 <Text strong>{total}</Text> 条结果（第 {page}/{totalPages || 1} 页）
          </Text>

          {results.map((item, idx) => (
            <Card
              key={`${item.document_id}-${idx}`}
              style={styles.resultCard}
              bodyStyle={{ padding: '16px 20px' }}
              hoverable
            >
              {/* Title */}
              <div style={styles.resultTitle}>
                <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                {item.title}
              </div>

              {/* Meta: file_type + course */}
              <div style={styles.resultMeta}>
                {fileTypeTag(item.file_type)}
                <Tag icon={<BookOutlined />} color="processing" style={{ borderRadius: 4, margin: 0 }}>
                  {item.course_name}
                </Tag>
                {item.matched_snippets.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    匹配 {item.matched_snippets.length} 段
                  </Text>
                )}
              </div>

              {/* Snippets */}
              {item.matched_snippets.slice(0, 3).map((snippet) => (
                <div key={snippet.chunk_id} style={styles.snippetBox}>
                  <Text style={styles.snippetScore}>
                    置信度: {(snippet.score * 100).toFixed(0)}%
                  </Text>
                  <div style={{ marginTop: 16 }}>
                    {highlightText(snippet.content, query)}
                  </div>
                </div>
              ))}

              {item.matched_snippets.length > 3 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                  ...还有 {item.matched_snippets.length - 3} 段匹配内容
                </Text>
              )}

              {/* Actions */}
              <div style={styles.resultActions}>
                <Button
                  type="link"
                  icon={<MessageOutlined />}
                  size="small"
                  onClick={() => goToQA(query)}
                >
                  Ask AI about this
                  <RightOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                </Button>
              </div>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.paginationWrap}>
              <Pagination
                current={page}
                total={total}
                pageSize={pageSize}
                onChange={handlePageChange}
                showSizeChanger={false}
                showQuickJumper
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
