/**
 * Service Template Generator
 *
 * Creates a ClusterIP service for each deployment
 */

export function generateServiceTemplate(chartName: string): string {
  return `{{- range $name, $deployment := .Values.deployments }}
{{- if $deployment.enabled }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "${chartName}.fullname" $ }}-{{ $name }}
  namespace: {{ $.Release.Namespace }}
  labels:
    {{- include "${chartName}.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  type: ClusterIP
  ports:
    - port: {{ $deployment.servicePort | default 80 }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${chartName}.selectorLabels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
{{- end }}
{{- end }}
`;
}
