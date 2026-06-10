import { useEffect, useState } from 'react'
import { Typography, Card, Table, Tag, Space, Button, Empty, message, Modal } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { listDocuments, approveDocument, type DocumentInfo } from '../../services/documentsApi'
import { refreshDashboard } from '../../services/refresh'

const { Title } = Typography

export default function ReviewList() {
  const [docs, setDocs] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPending = async () => {
    setLoading(true)
    try {
      const data = await listDocuments({ status: 'pending', page_size: 100 })
      setDocs(data.items || [])
    } catch {
      message.error('加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPending() }, [])

  const handleApprove = async (id: number) => {
    try {
      await approveDocument(id, { status: 'approved', comment: '审核通过' })
      message.success('已通过')
      refreshDashboard.trigger()
      fetchPending()
    } catch {
      message.error('操作失败')
    }
  }

  const handleReject = (id: number) => {
    Modal.confirm({
      title: '驳回文档',
      content: '确定驳回该文档？',
      onOk: async () => {
        try {
          await approveDocument(id, { status: 'rejected', comment: '审核驳回' })
          message.success('已驳回')
          refreshDashboard.trigger()
          fetchPending()
        } catch {
          message.error('操作失败')
        }
      },
    })
  }

  const fileTypeMap: Record<string, { color: string; text: string }> = {
    courseware: { color: 'blue', text: '课件' },
    lab_guide: { color: 'cyan', text: '实验指导' },
    assignment: { color: 'purple', text: '作业' },
    reference: { color: 'geekblue', text: '参考资料' },
    other: { color: 'default', text: '其他' },
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '文档名称', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '文件名', dataIndex: 'filename', key: 'filename', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      render: (t: string) => {
        const item = fileTypeMap[t] ?? { color: 'default', text: t }
        return <Tag color={item.color}>{item.text}</Tag>
      },
    },
    {
      title: '处理状态',
      dataIndex: 'processing_status',
      key: 'processing_status',
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'default', text: '未处理' },
          processing: { color: 'processing', text: '处理中' },
          completed: { color: 'green', text: '已完成' },
          failed: { color: 'red', text: '失败' },
        }
        const item = map[s] ?? { color: 'default', text: s }
        return <Tag color={item.color}>{item.text}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: DocumentInfo) =>
        record.status === 'pending' ? (
          <Space>
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleApprove(record.id)}>通过</Button>
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleReject(record.id)}>驳回</Button>
          </Space>
        ) : null,
    },
  ]

  return (
    <div>
      <Title level={2}>文档审核</Title>
      <Card style={{ marginTop: 16 }}>
        <Table
          columns={columns}
          dataSource={docs}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description="暂无待审核文档" /> }}
        />
      </Card>
    </div>
  )
}
