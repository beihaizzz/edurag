import { useState, useEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Typography,
  Card,
  Form,
  Input,
  Select,
  Upload,
  Button,
  message,
  Space,
  Divider,
} from 'antd'
import {
  InboxOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { uploadDocument, getCourses } from '../../services/documentsApi'
import type { CourseInfo } from '../../services/documentsApi'
import { refreshDashboard } from '../../services/refresh'

const { Title, Text } = Typography
const { Dragger } = Upload
const { TextArea } = Input

/* ── Design Tokens (Academic Minimal) ─────────────────────────────── */
const colors = {
  navy: '#1a365d',
  navyLight: '#2b6cb0',
  slate: '#1e293b',
  slateMuted: '#475569',
  slateSubtle: '#64748b',
  border: '#e2e8f0',
  cardBg: '#ffffff',
  pageBg: '#f8fafc',
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  backBtn: {
    color: colors.slateMuted,
    fontSize: 16,
    cursor: 'pointer',
    transition: 'color 0.2s',
  },
  title: {
    color: colors.navy,
    margin: 0,
  },
  card: {
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  draggerWrapper: {
    marginBottom: 24,
  },
  dragger: {
    borderRadius: 10,
    background: '#fafbfc',
  },
  submitBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTop: `1px solid ${colors.border}`,
  },
  hint: {
    color: colors.slateSubtle,
    fontSize: 13,
  },
}

/* ── File type options ────────────────────────────────────────────── */
const FILE_TYPE_OPTIONS = [
  { value: 'courseware', label: '课件' },
  { value: 'lab_guide', label: '实验指导' },
  { value: 'assignment', label: '作业' },
  { value: 'reference', label: '参考资料' },
  { value: 'other', label: '其他' },
]

/* ── Component ────────────────────────────────────────────────────── */
export default function DocumentUploadPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<any[]>([])
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [submitting, setSubmitting] = useState(false)

  /* 加载课程列表 */
  useEffect(() => {
    getCourses()
      .then(setCourses)
      .catch(() => {
        // 课程接口暂不可用时静默降级
      })
  }, [])

  /* 文件选择回调（仅保留一个文件） */
  const handleFileChange = (info: any) => {
    const latest = info.fileList.slice(-1)
    setFileList(latest)
  }

  /* 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.warning('请先选择要上传的文件')
        return
      }

      setSubmitting(true)
      const file = fileList[0].originFileObj as File

      await uploadDocument(file, {
        title: values.title,
        file_type: values.file_type,
        course_id: values.course_id,
        description: values.description,
        tags: values.tags,
      })

      message.success('文档上传成功，等待审核')
      refreshDashboard.trigger()
      navigate('/teacher/documents')
    } catch (err: any) {
      if (err.message) {
        message.error(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.page}>
      {/* ═══ Header ═══════════════════════════════════════════════════ */}
      <div style={styles.header}>
        <ArrowLeftOutlined
          style={styles.backBtn}
          onClick={() => navigate('/teacher/documents')}
        />
        <Title level={2} style={styles.title}>
          上传课程资料
        </Title>
      </div>

      {/* ═══ Form ═════════════════════════════════════════════════════ */}
      <Card style={styles.card} bordered={false}>
        <Form form={form} layout="vertical" size="large">
          {/* ── 文件上传 ────────────────────────────────────────── */}
          <div style={styles.draggerWrapper}>
            <Text
              strong
              style={{ display: 'block', marginBottom: 8, color: colors.slate }}
            >
              选择文件
            </Text>
            <Dragger
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={(file) => {
                // 手动控制上传，阻止自动上传
                const isLt50M = file.size / 1024 / 1024 < 50
                if (!isLt50M) {
                  message.error('文件大小不能超过 50MB')
                  return Upload.LIST_IGNORE
                }
                return false
              }}
              onRemove={() => setFileList([])}
              accept=".pdf,.docx,.pptx,.txt,.md,.xlsx"
              style={styles.dragger}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域</p>
              <p className="ant-upload-hint">
                支持 PDF、DOCX、PPTX、TXT、MD、XLSX，单个文件不超过 50MB
              </p>
            </Dragger>
          </div>

          <Divider style={{ margin: '0 0 20px' }} />

          {/* ── 标题 ────────────────────────────────────────────── */}
          <Form.Item
            name="title"
            label="资料标题"
            rules={[{ required: true, message: '请输入资料标题' }]}
          >
            <Input
              placeholder="例如：高等数学第一章课件"
              prefix={<FileTextOutlined style={{ color: colors.slateSubtle }} />}
            />
          </Form.Item>

          {/* ── 文件类型 + 课程 ─────────────────────────────────── */}
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              name="file_type"
              label="资料类型"
              rules={[{ required: true, message: '请选择资料类型' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="选择资料类型" options={FILE_TYPE_OPTIONS} />
            </Form.Item>

            <Form.Item name="course_id" label="关联课程" style={{ flex: 1 }}>
              <Select
                placeholder="选择课程（可选）"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)
                    ?.toLowerCase()
                    .includes(input.toLowerCase())
                }
                options={courses.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Form.Item>
          </Space>

          {/* ── 描述 ────────────────────────────────────────────── */}
          <Form.Item name="description" label="资料描述">
            <TextArea
              rows={3}
              placeholder="简要描述资料内容、适用章节等信息（可选）"
            />
          </Form.Item>

          {/* ── 标签 ────────────────────────────────────────────── */}
          <Form.Item name="tags" label="标签">
            <Select
              mode="tags"
              placeholder="输入标签后按回车添加"
              tokenSeparators={[',', '，']}
              options={[
                { value: '期末复习', label: '期末复习' },
                { value: '重点整理', label: '重点整理' },
                { value: '实验', label: '实验' },
                { value: '习题', label: '习题' },
                { value: '教案', label: '教案' },
              ]}
            />
          </Form.Item>

          {/* ── 提交栏 ──────────────────────────────────────────── */}
          <div style={styles.submitBar}>
            <span style={styles.hint}>
              提交后资料将进入审核流程
            </span>
            <Space>
              <Button onClick={() => navigate('/teacher/documents')}>
                取消
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                onClick={handleSubmit}
                style={{
                  background: colors.navy,
                  borderColor: colors.navy,
                }}
              >
                提交
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  )
}
