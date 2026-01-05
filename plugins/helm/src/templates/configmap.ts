/**
 * ConfigMap Template Generator
 */

export function generateConfigMapTemplate(chartName: string): string {
  return `{{- if .Values.config }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "${chartName}.fullname" . }}-config
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.config }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
{{- end }}
`;
}
