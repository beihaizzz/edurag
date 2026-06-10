import { Typography, Card, Table, Tag, Space, Button, Empty } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function ReviewList() {
  const columns = [
    { title: '文档名称', dataIndex: 'filename', key: 'filename' },
    { title: '上传者', dataIndex: 'uploader', key: 'uploader' },
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'orange', text: '待审核' },
          approved: { color: 'green', text: '已通过' },
          rejected: { color: 'red', text: '已驳回' },
        }
        const item = map[status] ?? { color: 'default', text: status }
        return <Tag color={item.color}>{item.text}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button type="link" icon={<CheckCircleOutlined />}>通过</Button>
          <Button type="link" danger icon={<CloseCircleOutlined />}>驳回</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>文档审核</Title>
      <Card style={{ marginTop: 16 }}>
        <Table columns={columns} dataSource={[]} rowKey="id" locale={{ emptyText: <Empty description="暂无待审核文档" /> }} />
      </Card>
    </div>
  )
}
