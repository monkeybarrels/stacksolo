/**
 * Deployment Template Generator
 *
 * Uses range to iterate over all deployments defined in values.yaml
 */

export function generateDeploymentTemplate(chartName: string): string {
  return `{{- range $name, $deployment := .Values.deployments }}
{{- if $deployment.enabled }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${chartName}.fullname" $ }}-{{ $name }}
  namespace: {{ $.Release.Namespace }}
  labels:
    {{- include "${chartName}.labels" $ | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  replicas: {{ $deployment.replicaCount | default $.Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${chartName}.selectorLabels" $ | nindent 6 }}
      app.kubernetes.io/component: {{ $name }}
  template:
    metadata:
      labels:
        {{- include "${chartName}.selectorLabels" $ | nindent 8 }}
        app.kubernetes.io/component: {{ $name }}
    spec:
      containers:
        - name: {{ $name }}
          image: "{{ $deployment.image.repository }}:{{ $deployment.image.tag }}"
          imagePullPolicy: {{ $.Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ $deployment.port | default 8080 }}
              protocol: TCP
          {{- if $deployment.env }}
          env:
            {{- range $key, $value := $deployment.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          {{- end }}
          resources:
            {{- if $deployment.resources }}
            {{- toYaml $deployment.resources | nindent 12 }}
            {{- else }}
            {{- toYaml $.Values.resources | nindent 12 }}
            {{- end }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
{{- end }}
{{- end }}
`;
}
