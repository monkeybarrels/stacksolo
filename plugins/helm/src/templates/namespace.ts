/**
 * Namespace Template Generator
 */

export function generateNamespaceTemplate(chartName: string): string {
  return `{{- if .Values.createNamespace }}
apiVersion: v1
kind: Namespace
metadata:
  name: {{ .Release.Namespace }}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
{{- end }}
`;
}
