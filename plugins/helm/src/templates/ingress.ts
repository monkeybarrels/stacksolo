/**
 * Ingress Template Generator
 *
 * Creates a K8s Ingress resource with path-based routing
 */

export function generateIngressTemplate(chartName: string): string {
  return `{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${chartName}.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "${chartName}.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  {{- if and .Values.ingress.tlsSecretName .Values.ingress.host }}
  tls:
    - hosts:
        - {{ .Values.ingress.host | quote }}
      secretName: {{ .Values.ingress.tlsSecretName }}
  {{- end }}
  rules:
    {{- if .Values.ingress.host }}
    - host: {{ .Values.ingress.host | quote }}
      http:
    {{- else }}
    - http:
    {{- end }}
        paths:
          {{- range .Values.ingress.routes }}
          - path: {{ .path }}
            pathType: Prefix
            backend:
              service:
                name: {{ include "${chartName}.fullname" $ }}-{{ .backend }}
                port:
                  number: {{ .port | default 80 }}
          {{- end }}
{{- end }}
`;
}
