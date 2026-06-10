import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Card, Tag, List, Row, Col, Skeleton, Space } from 'antd'
import {
  BookOutlined,
  FireOutlined,
  RightOutlined,
} from '@ant-design/icons'
import SearchBar from '../../components/SearchBar'

const { Title, Paragraph, Text } = Typography

// ─── Data ────────────────────────────────────────────────────────────────────

// TODO: Week 2 - fetch courses from /api/v1/courses
const COURSES = [
  { name: '大学物理', color: '#0891b2' },
  { name: '高等数学', color: '#dc2626' },
  { name: '程序设计', color: '#059669' },
  { name: '操作系统', color: '#7c3aed' },
  { name: '数据结构', color: '#d97706' },
  { name: '深度学习', color: '#0d9488' },
  { name: '软件工程', color: '#0284c7' },
  { name: '数字图像处理', color: '#db2777' },
  { name: 'Unity开发', color: '#4f46e5' },
]

// TODO: Week 2 - fetch popular questions from /api/v1/questions/hot
const POPULAR_QUESTIONS = [
  '操作系统实验报告怎么写？有哪些注意事项？',
  '高等数学期末重点是什么？怎么高效复习？',
  '数据结构中的二叉树遍历有哪些实际应用场景？',
  '大学物理电磁学部分有哪些常见考点和解题技巧？',
  '深度学习入门应该从哪些经典项目开始实践？',
]

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
  },
  hero: {
    background: 'linear-gradient(135deg, #0f1b2d 0%, #1a3a4a 50%, #0d5e6e 100%)',
    borderRadius: 16,
    padding: '48px 40px 40px',
    marginBottom: 28,
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute',
    inset: 0,
    opacity: 0.06,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
  },
  heroTitle: {
    color: '#ffffff',
    marginBottom: 8,
    fontWeight: 600,
    letterSpacing: '0.02em',
  } as CSSProperties,
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginBottom: 32,
  },
  searchWrapper: {
    display: 'flex',
    justifyContent: 'center',
  },
  sectionCard: {
    borderRadius: 12,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  } as CSSProperties,
  sectionCardBody: {
    padding: 0,
  },
  cardHeader: {
    padding: '18px 24px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  cardHeaderIcon: {
    fontSize: 20,
  },
  cardHeaderTitle: {
    marginBottom: 0,
    fontSize: 17,
    fontWeight: 600,
  } as CSSProperties,
  tagGrid: {
    padding: '16px 24px 24px',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  courseTag: {
    padding: '4px 16px',
    fontSize: 14,
    borderRadius: 20,
    cursor: 'pointer',
    border: 'none',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    lineHeight: '28px',
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
  },
  listItem: {
    padding: '14px 24px',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemText: {
    fontSize: 15,
    flex: 1,
  },
  listItemArrow: {
    fontSize: 12,
    color: '#bfbfbf',
    marginLeft: 12,
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  featureCard: {
    borderRadius: 12,
    border: '1px solid rgba(0, 0, 0, 0.06)',
    background: 'linear-gradient(145deg, #fafaf8 0%, #f0eee9 100%)',
  } as CSSProperties,
  featureList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  featureListItem: {
    padding: '6px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#4b5563',
    fontSize: 14,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    background: '#0d5e6e',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTagStyle(course: (typeof COURSES)[number]): CSSProperties {
  return {
    ...styles.courseTag,
    color: course.color,
    background: `${course.color}14`, // ~8% opacity
    border: `1px solid ${course.color}28`, // ~16% opacity
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentHomePage() {
  const navigate = useNavigate()
  // TODO: Week 2 - add useState loading state when fetching from API
  const [loading] = useState(false)

  if (loading) {
    return (
      <div style={styles.page}>
        <Card style={{ borderRadius: 12 }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    )
  }

  const handleCourseClick = (courseName: string) => {
    navigate(`/student/search?course=${encodeURIComponent(courseName)}`)
  }

  const handleQuestionClick = (question: string) => {
    navigate(`/student/search?q=${encodeURIComponent(question)}`)
  }

  return (
    <div style={styles.page}>
      {/* ── Hero Section ───────────────────────────────────────────── */}

      <div style={styles.hero}>
        <div style={styles.heroDecor} />
        <div style={styles.heroContent}>
          <Title level={2} style={styles.heroTitle}>
            课程资料检索与智能问答
          </Title>
          <Paragraph style={styles.heroSubtitle}>
            基于 RAG 技术的校园课程知识库，精准检索 + 智能问答，让学习更高效
          </Paragraph>
          <div style={styles.searchWrapper}>
            <SearchBar placeholder="输入关键词或问题，开始检索..." />
          </div>
        </div>
      </div>

      {/* ── Content Grid ───────────────────────────────────────────── */}

      <Row gutter={[24, 24]}>
        {/* Left — Course Categories + Popular Questions */}
        <Col xs={24} lg={16}>
          <div style={styles.leftCol}>
            {/* Course Categories */}
            {/* TODO: Week 2 - show Skeleton while loading courses */}
            <Card
              title={
                <div style={styles.cardHeader}>
                  <BookOutlined style={{ ...styles.cardHeaderIcon, color: '#0d5e6e' }} />
                  <span style={styles.cardHeaderTitle}>课程分类</span>
                </div>
              }
              headStyle={{ borderBottom: 'none', paddingBottom: 0 }}
              bodyStyle={styles.sectionCardBody}
              style={styles.sectionCard}
            >
              <div style={styles.tagGrid}>
                {COURSES.map((course) => (
                  <Tag
                    key={course.name}
                    style={getTagStyle(course)}
                    onClick={() => handleCourseClick(course.name)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.04)'
                      e.currentTarget.style.boxShadow = `0 2px 8px ${course.color}30`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {course.name}
                  </Tag>
                ))}
              </div>
            </Card>

            {/* Popular Questions */}
            <Card
              title={
                <div style={styles.cardHeader}>
                  <FireOutlined style={{ ...styles.cardHeaderIcon, color: '#d97706' }} />
                  <span style={styles.cardHeaderTitle}>热门问题</span>
                </div>
              }
              headStyle={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 0 }}
              bodyStyle={{ padding: 0 }}
              style={styles.sectionCard}
            >
              <List
                dataSource={POPULAR_QUESTIONS}
                renderItem={(question) => (
                  <List.Item
                    style={styles.listItem as CSSProperties}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(13, 94, 110, 0.04)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                    onClick={() => handleQuestionClick(question)}
                  >
                    <Text style={styles.listItemText}>{question}</Text>
                    <RightOutlined style={styles.listItemArrow} />
                  </List.Item>
                )}
              />
            </Card>
          </div>
        </Col>

        {/* Right — Feature highlights sidebar */}
        <Col xs={24} lg={8}>
          <Card style={styles.featureCard}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Title level={5} style={{ marginBottom: 12, color: '#1a3a4a' }}>
                平台功能
              </Title>
              <ul style={styles.featureList}>
                <li style={styles.featureListItem}>
                  <span style={{ ...styles.featureDot, background: '#0891b2' }} />
                  多课程资料统一检索
                </li>
                <li style={styles.featureListItem}>
                  <span style={{ ...styles.featureDot, background: '#059669' }} />
                  自然语言智能问答
                </li>
                <li style={styles.featureListItem}>
                  <span style={{ ...styles.featureDot, background: '#d97706' }} />
                  课程分类精准筛选
                </li>
                <li style={styles.featureListItem}>
                  <span style={{ ...styles.featureDot, background: '#7c3aed' }} />
                  历史问答记录回溯
                </li>
                <li style={styles.featureListItem}>
                  <span style={{ ...styles.featureDot, background: '#db2777' }} />
                  教师上传资料管理
                </li>
              </ul>
            </Space>
          </Card>

          {/* Quick stats placeholder */}
          <Card
            style={{
              ...styles.featureCard,
              marginTop: 24,
              background: 'linear-gradient(145deg, #f0f4f8 0%, #e2e8f0 100%)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Title level={5} style={{ marginBottom: 8, color: '#1a3a4a' }}>
                数据概览
              </Title>
              {/* TODO: Week 2 - display real stats from /api/v1/stats */}
              <Text style={{ color: '#6b7280', fontSize: 13 }}>
                系统已收录 <strong style={{ color: '#0d5e6e' }}>9</strong> 门课程资料
              </Text>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>
                支持关键词检索与语义问答
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
