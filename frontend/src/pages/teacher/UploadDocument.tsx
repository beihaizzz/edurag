import { Typography, Card, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography
const { Dragger } = Upload

export default function UploadDocument() {
  const uploadProps = {
    name: 'file',
    action: '/api/v1/documents/upload',
    onChange(info: any) {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 上传成功`)
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 上传失败`)
      }
    },
  }

  return (
    <div>
      <Title level={2}>上传文档</Title>
      <Paragraph type="secondary">支持 PDF、DOCX、PPTX、TXT 格式</Paragraph>
      <Card style={{ marginTop: 16 }}>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持单个或批量上传，文件大小不超过 50MB
          </p>
        </Dragger>
      </Card>
    </div>
  )
}
